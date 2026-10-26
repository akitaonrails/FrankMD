# frozen_string_literal: true

module RecentFilesHelper
  def recent_file_opened_at(value)
    Time.iso8601(value)
  rescue ArgumentError
    nil
  end

  def recent_file_opened_ago(opened_at)
    seconds = [ (Time.current - opened_at).to_i, 0 ].max
    return t("home.opened_ago.just_now") if seconds.zero?
    return t("home.opened_ago.over_a_week") if seconds > 1.week

    unit, count = if seconds < 1.minute
      [ "seconds", seconds ]
    elsif seconds < 1.hour
      [ "minutes", seconds / 60 ]
    elsif seconds < 1.day
      [ "hours", seconds / 3600 ]
    else
      [ "days", seconds / 86400 ]
    end

    t("home.opened_ago.#{unit}", count: count)
  end
end
