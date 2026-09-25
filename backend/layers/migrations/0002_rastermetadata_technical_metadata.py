from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("layers", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="rastermetadata",
            name="technical_metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
