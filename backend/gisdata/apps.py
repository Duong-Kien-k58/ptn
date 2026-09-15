from django.apps import AppConfig


class GisdataConfig(AppConfig):
    """Khai báo ứng dụng dữ liệu không gian của PTN."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "gisdata"
