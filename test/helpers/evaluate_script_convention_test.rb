# frozen_string_literal: true

require "test_helper"

# Selenium's Capybara driver evaluates `evaluate_script` as `return (SCRIPT);`.
# A multi-statement script therefore becomes a syntax error ("Unexpected token
# 'const'") rather than a failing assertion — the test dies with a JavascriptError
# that says nothing about the app. Multi-statement scripts must be wrapped in an
# IIFE, or sent through `execute_script`, which is not wrapped.
#
# This guard keeps that class of mistake out of the system suite.
class EvaluateScriptConventionTest < ActiveSupport::TestCase
  SCRIPT_OPENERS = %r{evaluate_script\(<<~(\w+)\)\n}.freeze
  STATEMENT_START = /\A(?:const|let|var|if|for|while|return|switch|try)\b/.freeze

  test "multi-statement evaluate_script bodies are wrapped in an IIFE" do
    offenders = []

    Dir[Rails.root.join("test/system/*.rb")].sort.each do |path|
      lines = File.readlines(path)
      index = 0

      while index < lines.size
        match = lines[index].match(SCRIPT_OPENERS)
        unless match
          index += 1
          next
        end

        terminator = match[1]
        body = []
        cursor = index + 1
        while cursor < lines.size && lines[cursor].strip != terminator
          body << lines[cursor].strip
          cursor += 1
        end

        first_statement = body.reject(&:empty?).first.to_s
        offenders << "#{path}:#{index + 1}" if first_statement.match?(STATEMENT_START)
        index = cursor + 1
      end
    end

    assert_empty offenders,
      "evaluate_script wraps its argument in `return (...)`, so multi-statement " \
      "scripts must be IIFE-wrapped (or use execute_script): #{offenders.join(', ')}"
  end
end
