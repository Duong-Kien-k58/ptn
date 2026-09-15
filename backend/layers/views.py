from django.http import JsonResponse


def health(request):
    """
    API kiểm tra backend có đang hoạt động hay không.

    Frontend sẽ gọi API này trước khi làm các chức năng bản đồ,
    đăng nhập và quản lý dữ liệu.
    """
    return JsonResponse(
        {
            "status": "ok",
            "service": "PTN WebGIS backend",
            "message": "Backend đang hoạt động bình thường.",
        }
    )