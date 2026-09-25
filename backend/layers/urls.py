from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health),
    path("features/<str:layer_name>/add/", views.add_feature),
    path("features/<str:layer_name>/<int:feature_id>/edit/", views.edit_feature),
    path("features/<str:layer_name>/<int:feature_id>/delete/", views.delete_feature),
    path("rasters/", views.list_rasters),
    path("rasters/upload/", views.save_raster),
    path("rasters/<str:raster_name>/upload/", views.save_raster),
    path("rasters/<str:raster_name>/metadata/", views.update_raster_metadata),
    path("rasters/<str:raster_name>/sync/", views.sync_raster_from_geoserver),
    path("rasters/<str:raster_name>/delete/", views.delete_raster),
]
