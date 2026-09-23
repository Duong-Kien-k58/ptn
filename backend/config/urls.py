from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

urlpatterns = [
    path("api/auth/", include("accounts.urls")),
    # Mọi URL bắt đầu bằng /api/ sẽ được chuyển sang file layers/urls.py xử lý
    path("api/", include("layers.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
