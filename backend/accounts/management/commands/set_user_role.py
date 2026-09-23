from django.core.management.base import BaseCommand, CommandError

from accounts.models import UserProfile


class Command(BaseCommand):
    help = "Set an account role to student or admin."

    def add_arguments(self, parser):
        parser.add_argument("username", help="Username to update")
        parser.add_argument("role", choices=["student", "admin"], help="New role")

    def handle(self, *args, **options):
        try:
            profile = UserProfile.objects.select_related("user").get(user__username=options["username"])
        except UserProfile.DoesNotExist as exc:
            raise CommandError("User profile was not found.") from exc

        profile.role = options["role"]
        profile.save(update_fields=["role", "updated_at"])
        self.stdout.write(self.style.SUCCESS(f"Role for {profile.user.username} is now {options['role']}."))
