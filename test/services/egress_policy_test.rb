# frozen_string_literal: true

require "test_helper"

class EgressPolicyTest < ActiveSupport::TestCase
  # --- scheme / shape ---

  test "rejects a non-http scheme" do
    error = assert_raises(EgressPolicy::BlockedError) do
      EgressPolicy.checked_target("file:///etc/passwd")
    end
    assert_includes error.message, "http"
  end

  test "rejects a URL with no host" do
    assert_raises(EgressPolicy::BlockedError) { EgressPolicy.checked_target("http://") }
  end

  test "rejects a host that does not resolve" do
    EgressPolicy.stubs(:resolve).returns([])

    assert_raises(EgressPolicy::BlockedError) do
      EgressPolicy.checked_target("https://does-not-exist.invalid/x.png")
    end
  end

  # --- address policy (the SSRF vectors) ---

  test "blocks the cloud metadata address" do
    assert EgressPolicy.blocked_ip?(IPAddr.new("169.254.169.254"))
  end

  test "blocks loopback, private and link-local addresses" do
    %w[127.0.0.1 10.0.0.5 172.16.0.1 192.168.1.10 169.254.1.1 ::1 fc00::1 fe80::1].each do |addr|
      assert EgressPolicy.blocked_ip?(IPAddr.new(addr)), "#{addr} should be blocked"
    end
  end

  test "blocks reserved, unspecified and multicast ranges" do
    %w[0.0.0.0 100.64.0.1 192.0.2.1 198.18.0.1 203.0.113.1 240.0.0.1 224.0.0.1 ff02::1].each do |addr|
      assert EgressPolicy.blocked_ip?(IPAddr.new(addr)), "#{addr} should be blocked"
    end
  end

  test "blocks an IPv4-mapped IPv6 loopback" do
    # ::ffff:127.0.0.1 must be judged on its IPv4 value, not as a plain v6 address
    assert EgressPolicy.blocked_ip?(IPAddr.new("::ffff:127.0.0.1"))
  end

  test "allows a public address" do
    refute EgressPolicy.blocked_ip?(IPAddr.new("93.184.216.34"))
    refute EgressPolicy.blocked_ip?(IPAddr.new("2606:2800:220:1:248:1893:25c8:1946"))
  end

  # --- end to end ---

  test "rejects a host that resolves to a private address" do
    EgressPolicy.stubs(:resolve).returns([ IPAddr.new("169.254.169.254") ])

    error = assert_raises(EgressPolicy::BlockedError) do
      EgressPolicy.checked_target("http://metadata.example.com/latest/meta-data/")
    end
    assert_includes error.message, "non-public"
  end

  test "rejects when any resolved address is non-public" do
    # A host resolving to both a public and a private address must be refused.
    EgressPolicy.stubs(:resolve).returns([ IPAddr.new("93.184.216.34"), IPAddr.new("127.0.0.1") ])

    assert_raises(EgressPolicy::BlockedError) do
      EgressPolicy.checked_target("https://split-horizon.example.com/x.png")
    end
  end

  test "returns the uri and the resolved ip for a public host" do
    EgressPolicy.stubs(:resolve).returns([ IPAddr.new("93.184.216.34") ])

    uri, ip = EgressPolicy.checked_target("https://example.com/image.png")

    assert_equal "example.com", uri.host
    assert_equal "/image.png", uri.path
    assert_equal "93.184.216.34", ip
  end
end
