# frozen_string_literal: true

require "ipaddr"
require "socket"

# Guard for server-side fetches of user-supplied URLs (SSRF defense).
#
# Without it, an endpoint that downloads "an image URL" can be pointed at the
# cloud metadata service (169.254.169.254), at localhost, or at hosts on the
# private network the server can reach but the caller cannot.
#
# `checked_target` validates the scheme, resolves the host, and rejects the
# request unless *every* resolved address is a public unicast address. It
# returns the resolved IP alongside the URI so the caller can pin the
# connection to the address that was actually validated (via
# `Net::HTTP#ipaddr=`), which closes the DNS-rebinding window between the
# check and the connect while keeping the hostname for Host/SNI.
module EgressPolicy
  class BlockedError < StandardError; end

  ALLOWED_SCHEMES = %w[http https].freeze

  # Ranges that are never a legitimate fetch target. IPAddr covers loopback,
  # private and link-local; these are the extra reserved blocks it doesn't.
  EXTRA_BLOCKED = [
    IPAddr.new("0.0.0.0/8"),        # "this" network
    IPAddr.new("100.64.0.0/10"),    # CGNAT
    IPAddr.new("192.0.0.0/24"),     # IETF protocol assignments
    IPAddr.new("192.0.2.0/24"),     # TEST-NET-1
    IPAddr.new("198.18.0.0/15"),    # benchmarking
    IPAddr.new("198.51.100.0/24"),  # TEST-NET-2
    IPAddr.new("203.0.113.0/24"),   # TEST-NET-3
    IPAddr.new("240.0.0.0/4"),      # reserved
    IPAddr.new("::/128"),           # unspecified
    IPAddr.new("100::/64")          # discard-only
  ].freeze

  module_function

  # Returns [URI, resolved_ip_string] for a URL that is safe to fetch.
  # Raises BlockedError otherwise.
  def checked_target(url)
    uri = begin
      URI.parse(url.to_s)
    rescue URI::InvalidURIError
      raise BlockedError, "Invalid URL"
    end

    unless ALLOWED_SCHEMES.include?(uri.scheme)
      raise BlockedError, "Only http and https URLs can be fetched"
    end
    raise BlockedError, "URL has no host" if uri.host.blank?

    addresses = resolve(uri.host)
    raise BlockedError, "Could not resolve #{uri.host}" if addresses.empty?

    blocked = addresses.find { |ip| blocked_ip?(ip) }
    if blocked
      raise BlockedError, "Refusing to fetch a non-public address (#{blocked})"
    end

    [ uri, addresses.first.to_s ]
  end

  def resolve(host)
    Addrinfo.getaddrinfo(host, nil, nil, :STREAM).filter_map do |info|
      IPAddr.new(info.ip_address)
    rescue IPAddr::InvalidAddressError
      nil
    end
  rescue SocketError, ArgumentError
    []
  end

  def blocked_ip?(ip)
    # IPv4-mapped IPv6 (::ffff:127.0.0.1) must be judged on the IPv4 value.
    ip = ip.native if ip.ipv6? && ip.ipv4_mapped?

    return true if ip.loopback? || ip.private? || ip.link_local?
    return true if ip.ipv4? && ip.to_i == 0
    return true if EXTRA_BLOCKED.any? { |range| range.include?(ip) }

    # Multicast: 224.0.0.0/4 and ff00::/8
    return true if ip.ipv4? && (ip.to_i >> 28) == 0b1110
    return true if ip.ipv6? && IPAddr.new("ff00::/8").include?(ip)

    false
  end
end
