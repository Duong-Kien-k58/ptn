from django.urls import path

from . import views

urlpatterns = [
    path("csrf/", views.csrf),
    path("register/", views.register),
    path("login/", views.login),
    path("logout/", views.logout),
    path("me/", views.me),
    path("profile/", views.profile),
    path("change-password/", views.change_password),
]
