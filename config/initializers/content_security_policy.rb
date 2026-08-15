Rails.application.config.content_security_policy_nonce_generator = ->(_request) { SecureRandom.base64(16) }
Rails.application.config.content_security_policy_nonce_directives = %w[script-src]

Rails.application.config.content_security_policy do |policy|
  policy.default_src :self
  policy.script_src :self
  policy.style_src :self, :unsafe_inline
  policy.img_src "*", :data, :blob
  policy.media_src "*", :data, :blob
  policy.font_src :self, :data
  policy.connect_src :self
  policy.frame_src "https://youtube.com", "https://www.youtube.com",
                   "https://youtube-nocookie.com", "https://www.youtube-nocookie.com",
                   "https://player.vimeo.com"
  policy.frame_ancestors :none
  policy.object_src :none
  policy.base_uri :self
  policy.form_action :self
end
