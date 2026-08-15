class ApplicationController < ActionController::Base
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  # Changes to the importmap will invalidate the etag for HTML responses
  stale_when_importmap_changes

  before_action :set_locale
  before_action :reject_invalid_auth_configuration
  before_action :require_auth

  private

  def set_locale
    locale = params[:locale] ||
             current_config&.get("locale") ||
             I18n.default_locale

    I18n.locale = locale.to_s.to_sym if I18n.available_locales.include?(locale.to_s.to_sym)
  end

  def require_auth
    token = current_auth_token
    return if token.blank? || authenticated_session?(token) || valid_auth_header_for_current_token?

    reset_session if session[:frankmd_auth_token_digest].present?

    if json_request?
      render json: { error: "unauthorized" }, status: :unauthorized
    elsif request.get? && request.format.html?
      session[:frankmd_return_to] = request.fullpath
      redirect_to login_path
    else
      head :unauthorized
    end
  end

  # Permit API clients that authenticate with the current token to make state-
  # changing requests without a browser CSRF token. Cookie-authenticated
  # requests still require normal CSRF verification.
  def verified_request?
    super || valid_auth_header_for_current_token?
  end

  def current_auth_token
    Config.new.get("auth_token")
  end

  def auth_token_misconfigured?
    current_auth_token.present? && current_auth_token.bytesize < 32
  end

  def valid_auth_header_for_current_token?
    token = current_auth_token
    token.present? && !auth_token_misconfigured? && valid_auth_token?(token, auth_header_token)
  end

  def valid_auth_token?(token, provided_token = auth_header_token)
    return false if token.blank? || provided_token.blank?

    ActiveSupport::SecurityUtils.secure_compare(auth_token_digest(token), auth_token_digest(provided_token))
  end

  def authenticated_session?(token)
    stored_digest = session[:frankmd_auth_token_digest].to_s
    stored_digest.present? &&
      ActiveSupport::SecurityUtils.secure_compare(stored_digest, auth_token_digest(token))
  end

  def auth_token_digest(token)
    Digest::SHA256.hexdigest(token)
  end

  def auth_header_token
    bearer_token = request.authorization.to_s[/\ABearer (.+)\z/, 1]
    bearer_token.presence || request.headers["X-Auth-Token"].to_s
  end

  def reject_invalid_auth_configuration
    return unless auth_token_misconfigured?

    if json_request?
      render json: { error: "service unavailable" }, status: :service_unavailable
    else
      render plain: "Authentication is temporarily unavailable", status: :service_unavailable
    end
  end

  def json_request?
    request.format.json? || request.headers["Accept"]&.include?("application/json")
  end

  def current_config
    @current_config ||= begin
      base_path = ENV.fetch("NOTES_PATH", Rails.root.join("notes"))
      Config.new(base_path: base_path)
    rescue
      nil
    end
  end
end
