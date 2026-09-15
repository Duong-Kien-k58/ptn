from django.urls import path

from . import views

urlpatterns = [
    # URL cuối cùng là: /api/health/
    path("health/", views.health, name="health"),
]