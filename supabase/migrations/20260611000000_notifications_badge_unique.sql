-- Prevent duplicate badge_earned notifications per user per badge.
-- Partial unique index: only enforces uniqueness within the badge_earned type.
create unique index if not exists notifications_badge_earned_unique
  on notifications (user_id, (data->>'badge_slug'))
  where type = 'badge_earned';
