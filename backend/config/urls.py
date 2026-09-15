from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    # Trang quản trị có sẵn của Django.
    path("admin/", admin.site.urls),

    # Tất cả API của PTN bắt đầu bằng /api/.
    path("api/", include("layers.urls")),
]