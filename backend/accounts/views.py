import json
from pathlib import Path
from uuid import uuid4

from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout, update_session_auth_hash
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods, require_POST

from .models import UserProfile


def read_json(request):
    try:
        data = json.loads(request.body or "{}")
    except (TypeError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def error(message, status=400):
    return JsonResponse({"success": False, "message": message}, status=status)


def user_data(user):
    profile = UserProfile.objects.filter(user=user).first()
    role = profile.role if profile else UserProfile.Role.STUDENT
    return {
        "username": user.username,
        "full_name": profile.full_name if profile else user.get_full_name() or user.username,
        "role": role,
        "avatar": default_storage.url(profile.avatar) if profile and profile.avatar else "",
    }


def current_profile(request):
    if not request.user.is_authenticated:
        return None, error("Bạn cần đăng nhập để thực hiện thao tác này.", 401)
    profile = UserProfile.objects.filter(user=request.user).first()
    if not profile:
        return None, error("Không tìm thấy hồ sơ người dùng.", 404)
    return profile, None


def validate_avatar(upload):
    extension = Path(upload.name).suffix.lower()
    signature = upload.read(12)
    upload.seek(0)
    is_png = extension == ".png" and signature.startswith(b"\x89PNG\r\n\x1a\n")
    is_jpeg = extension in {".jpg", ".jpeg"} and signature.startswith(b"\xff\xd8\xff")
    if not is_png and not is_jpeg:
        return "Chỉ hỗ trợ ảnh PNG, JPG hoặc JPEG hợp lệ."
    if upload.size > 2 * 1024 * 1024:
        return "Ảnh đại diện không được vượt quá 2 MB."
    return None


def save_avatar(profile, upload):
    """Lưu ảnh hợp lệ với tên ngẫu nhiên để không ghi đè tệp khác."""
    extension = Path(upload.name).suffix.lower()

    old_avatar = profile.avatar
    profile.avatar = default_storage.save(
        f"avatars/{profile.user_id}/{uuid4().hex}{extension}", upload
    )
    if old_avatar and old_avatar.startswith("avatars/"):
        default_storage.delete(old_avatar)


@ensure_csrf_cookie
def csrf(request):
    return JsonResponse({"success": True, "csrfToken": get_token(request)})


def me(request):
    user = request.user if request.user.is_authenticated else None
    return JsonResponse({"success": True, "user": user_data(user) if user else None})


@require_http_methods(["GET", "PUT", "POST"])
def profile(request):
    profile, response = current_profile(request)
    if response:
        return response
    if request.method == "GET":
        return JsonResponse({
            "success": True,
            "profile": {
                **user_data(request.user),
                "email": request.user.email,
                "student_code": profile.student_code or "",
                "phone": profile.phone or "",
                "class_name": profile.class_name or "",
            },
        })

    # Django chỉ tự đọc multipart cho POST; vẫn giữ PUT cho client JSON cũ.
    data = request.POST if request.method == "POST" else read_json(request)
    if data is None:
        return error("Dữ liệu cập nhật không hợp lệ.")
    full_name = str(data.get("full_name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    student_code = str(data.get("student_code", "")).strip() or None
    if not full_name or not email:
        return error("Họ tên và email là bắt buộc.")
    try:
        validate_email(email)
    except ValidationError as exc:
        return error(" ".join(exc.messages))
    if User.objects.filter(email__iexact=email).exclude(pk=request.user.pk).exists():
        return error("Email đã được sử dụng.")
    if student_code and UserProfile.objects.filter(student_code=student_code).exclude(pk=profile.pk).exists():
        return error("Mã học viên đã được sử dụng.")
    upload = request.FILES.get("avatar")
    if upload:
        avatar_error = validate_avatar(upload)
        if avatar_error:
            return error(avatar_error)

    request.user.email = email
    request.user.save(update_fields=["email"])
    profile.full_name = full_name
    profile.student_code = student_code
    profile.phone = str(data.get("phone", "")).strip() or None
    profile.class_name = str(data.get("class_name", "")).strip() or None
    if upload:
        save_avatar(profile, upload)
    profile.save()
    return JsonResponse({"success": True, "user": user_data(request.user), "message": "Đã cập nhật thông tin cá nhân."})


@require_POST
def change_password(request):
    profile, response = current_profile(request)
    if response:
        return response
    data = read_json(request) or {}
    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")
    if not request.user.check_password(current_password):
        return error("Mật khẩu hiện tại không đúng.")
    try:
        validate_password(new_password, request.user)
    except ValidationError as exc:
        return error(" ".join(exc.messages))
    request.user.set_password(new_password)
    request.user.save(update_fields=["password"])
    update_session_auth_hash(request, request.user)
    return JsonResponse({"success": True, "message": "Đã đổi mật khẩu."})


@require_POST
def register(request):
    data = read_json(request)
    if not data:
        return error("Dữ liệu đăng ký không hợp lệ.")

    username = str(data.get("username", "")).strip()
    password = data.get("password", "")
    email = str(data.get("email", "")).strip().lower()
    full_name = str(data.get("full_name", "")).strip()
    student_code = str(data.get("student_code", "")).strip() or None

    if len(username) < 3 or not password or not email or not full_name:
        return error("Hãy nhập tên đăng nhập, họ tên, email và mật khẩu.")
    try:
        validate_email(email)
        validate_password(password, User(username=username, email=email))
    except ValidationError as exc:
        return error(" ".join(exc.messages))
    if User.objects.filter(username__iexact=username).exists():
        return error("Tên đăng nhập đã được sử dụng.")
    if User.objects.filter(email__iexact=email).exists():
        return error("Email đã được sử dụng.")
    if student_code and UserProfile.objects.filter(student_code=student_code).exists():
        return error("Mã học viên đã được sử dụng.")

    try:
        with transaction.atomic():
            user = User.objects.create_user(username=username, email=email, password=password)
            UserProfile.objects.create(
                user=user,
                full_name=full_name,
                student_code=student_code,
                phone=str(data.get("phone", "")).strip() or None,
                class_name=str(data.get("class_name", "")).strip() or None,
                role=UserProfile.Role.STUDENT,
            )
    except IntegrityError:
        return error("Thông tin đăng ký đã tồn tại. Vui lòng kiểm tra lại.")

    auth_login(request, user)
    return JsonResponse({"success": True, "user": user_data(user)}, status=201)


@require_POST
def login(request):
    data = read_json(request) or {}
    user = authenticate(
        request,
        username=str(data.get("username", "")).strip(),
        password=data.get("password", ""),
    )
    if user is None:
        return error("Tên đăng nhập hoặc mật khẩu không đúng.")
    auth_login(request, user)
    return JsonResponse({"success": True, "user": user_data(user)})


@require_POST
def logout(request):
    auth_logout(request)
    return JsonResponse({"success": True, "message": "Đã đăng xuất."})
