# frozen_string_literal: true

class SessionsController < ApplicationController
  skip_before_action :require_auth
  skip_before_action :reject_invalid_auth_configuration

  MAX_LOGIN_FAILURES = 10
  LOGIN_FAILURE_WINDOW = 5.minutes

  def new
    @auth_misconfigured = auth_token_misconfigured?
  end

  def create
    if auth_token_misconfigured?
      flash.now[:alert] = "Authentication is temporarily unavailable"
      render :new, status: :service_unavailable
    elsif login_throttled?
      flash.now[:alert] = "Too many login attempts. Please try again later."
      render :new, status: :too_many_requests
    elsif valid_auth_token?(current_auth_token, params[:password])
      return_to = safe_return_to(session[:frankmd_return_to])
      failure_cache_keys = login_failure_cache_keys
      reset_session
      failure_cache_keys.each { |key| Rails.cache.delete(key) }
      session[:frankmd_auth_token_digest] = auth_token_digest(current_auth_token)
      redirect_to return_to || root_path
    else
      register_login_failure!
      flash.now[:alert] = "Invalid access token"
      render :new, status: :unauthorized
    end
  end

  def destroy
    reset_session
    redirect_to login_path
  end

  private

  def login_failure_cache_keys
    [ ip_login_failure_cache_key, session_login_failure_cache_key ]
  end

  def ip_login_failure_cache_key
    [ "frankmd/login-failures/ip", request.remote_ip.to_s ]
  end

  def session_login_failure_cache_key
    session[:frankmd_login_throttle_id] ||= SecureRandom.hex(16)
    [ "frankmd/login-failures/session", session[:frankmd_login_throttle_id] ]
  end

  def login_throttled?
    login_failure_state.fetch("count", 0) >= MAX_LOGIN_FAILURES ||
      login_failure_cache_keys.any? { |key| Rails.cache.read(key).to_i >= MAX_LOGIN_FAILURES }
  end

  def register_login_failure!
    ip_key, session_key = login_failure_cache_keys
    session_failures = [ login_failure_state.fetch("count", 0), Rails.cache.read(session_key).to_i ].max + 1
    ip_failures = Rails.cache.read(ip_key).to_i + 1
    session[:frankmd_login_failure_state] = {
      "count" => session_failures,
      "expires_at" => LOGIN_FAILURE_WINDOW.from_now.to_i
    }
    Rails.cache.write(ip_key, ip_failures, expires_in: LOGIN_FAILURE_WINDOW)
    Rails.cache.write(session_key, session_failures, expires_in: LOGIN_FAILURE_WINDOW)
  end

  def login_failure_state
    state = session[:frankmd_login_failure_state].to_h
    return {} if state.fetch("expires_at", 0).to_i < Time.current.to_i

    state
  end

  def safe_return_to(path)
    path if path.to_s.start_with?("/") && !path.to_s.start_with?("//")
  end
end
