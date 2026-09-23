from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health),  # Kiểm tra backend
    path("features/<str:layer_name>/add/", views.add_feature),  # Thêm đối tượng
    path("features/<str:layer_name>/<int:feature_id>/edit/", views.edit_feature),  # Sửa đối tượng
    path("features/<str:layer_name>/<int:feature_id>/delete/", views.delete_feature),  # Xóa đối tượng
    path("rasters/", views.list_rasters),  # Danh sách raster
    path("rasters/upload/", views.save_raster),  # Thêm raster
    path("rasters/<str:raster_name>/upload/", views.save_raster),  # Cập nhật raster
    path("rasters/<str:raster_name>/delete/", views.delete_raster),  # Xóa raster
]