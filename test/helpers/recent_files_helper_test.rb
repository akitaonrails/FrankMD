# frozen_string_literal: true

require "test_helper"

class RecentFilesHelperTest < ActionView::TestCase
  include RecentFilesHelper

  test "opening times use one unit with exact unit and week boundaries" do
    freeze_time do
      {
        0 => "Just now",
        1 => "1 second ago",
        59 => "59 seconds ago",
        60 => "1 minute ago",
        119 => "1 minute ago",
        600 => "10 minutes ago",
        3599 => "59 minutes ago",
        3600 => "1 hour ago",
        7200 => "2 hours ago",
        86399 => "23 hours ago",
        86400 => "1 day ago",
        172800 => "2 days ago",
        604800 => "7 days ago",
        604801 => "Over a week ago"
      }.each do |seconds, label|
        assert_equal label, recent_file_opened_ago(Time.current - seconds), "Age: #{seconds} seconds"
      end

      assert_equal "Just now", recent_file_opened_ago(1.minute.from_now)
    end
  end

  test "opening times use the current locale" do
    freeze_time do
      I18n.with_locale(:"pt-BR") do
        assert_equal "há 1 dia", recent_file_opened_ago(1.day.ago)
        assert_equal "há 2 dias", recent_file_opened_ago(2.days.ago)
        assert_equal "Há mais de uma semana", recent_file_opened_ago(8.days.ago)
      end
    end
  end

  test "opening timestamps preserve timezone offsets and tolerate malformed history" do
    timestamp = recent_file_opened_at("2026-10-26T09:30:00-03:00")
    assert_equal Time.utc(2026, 10, 26, 12, 30), timestamp
    assert_equal(-10800, timestamp.utc_offset)
    assert_nil recent_file_opened_at("not a timestamp")
    assert_nil recent_file_opened_at("")
  end
end
