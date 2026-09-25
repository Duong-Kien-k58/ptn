from django.db import migrations, models


def add_existing_rasters(apps, schema_editor):
    RasterMetadata = apps.get_model("layers", "RasterMetadata")
    for name, title in [
        ("fast_alpha", "Dữ liệu nền VN25K"),
        ("SRTM_30_VN_UTM", "DEM Việt Nam (SRTM 30 m)"),
    ]:
        RasterMetadata.objects.get_or_create(name=name, defaults={"title": title})


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="RasterMetadata",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=63, unique=True)),
                ("title", models.CharField(max_length=150)),
                ("crs", models.CharField(blank=True, max_length=64)),
                ("bbox", models.JSONField(default=list)),
                ("width", models.PositiveIntegerField(blank=True, null=True)),
                ("height", models.PositiveIntegerField(blank=True, null=True)),
                ("source_filename", models.CharField(blank=True, max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "raster_metadata", "ordering": ["title", "name"]},
        ),
        migrations.RunPython(add_existing_rasters, migrations.RunPython.noop),
    ]
