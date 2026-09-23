from functools import wraps

from django.http import JsonResponse

from .models import UserProfile


def admin_required(view):
    """Chỉ cho Quản trị viên thực hiện thao tác làm thay đổi dữ liệu."""
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        profile = UserProfile.objects.filter(user=request.user).first() if request.user.is_authenticated else None
        if not profile or profile.role != UserProfile.Role.ADMIN:
            return JsonResponse(
                {"success": False, "message": "Chỉ Quản trị viên được phép thực hiện thao tác này."},
                status=403,
            )
        return view(request, *args, **kwargs)

    return wrapped
