from django.http import JsonResponse

from .raster import delete_raster, list_rasters, save_raster, sync_raster_from_geoserver, update_raster_metadata
from .vector import add_feature, delete_feature, edit_feature


def health(request):
    return JsonResponse({"status": "ok", "service": "PTN WebGIS backend"})
