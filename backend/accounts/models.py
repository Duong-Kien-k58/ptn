from django.contrib.auth.models import User
from django.db import models


class UserProfile(models.Model):
    class Role(models.TextChoices):
        STUDENT = "student", "Học viên"
        ADMIN = "admin", "Quản trị viên"

    user = models.OneToOneField(User, db_column="user_id", on_delete=models.CASCADE, related_name="profile")
    full_name = models.CharField(max_length=150)
    student_code = models.CharField(max_length=50, unique=True, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    class_name = models.CharField(max_length=100, blank=True, null=True)
    avatar = models.CharField(max_length=255, blank=True, null=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.STUDENT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_profiles"
        managed = False  # Bảng đã được tạo trong ptn_db bằng pgAdmin.
