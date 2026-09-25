from django.db import models


class RasterMetadata(models.Model):
    """Thông tin raster đã được publish; GeoServer chỉ đảm nhiệm cung cấp WMS."""

    name = models.CharField(max_length=63, unique=True)
    title = models.CharField(max_length=150)
    crs = models.CharField(max_length=64, blank=True)
    bbox = models.JSONField(default=list)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    source_filename = models.CharField(max_length=255, blank=True)
    technical_metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "raster_metadata"
        ordering = ["title", "name"]
