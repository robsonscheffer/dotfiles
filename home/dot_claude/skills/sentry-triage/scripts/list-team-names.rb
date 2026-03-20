#!/usr/bin/env ruby
# frozen_string_literal: true

# Lists team_name values from teams.yml for use with Sentry owner_team_name tag
# Usage: ruby list-team-names.rb

require "yaml"

teams_file = File.expand_path("../../../../subsystems/dev_tools/teams/config/teams.yml", __dir__)
teams_config = YAML.load_file(teams_file)

team_names = teams_config["dev_teams"].
  filter_map { |team| team["team_name"] }.
  uniq.
  sort

puts team_names.join("\n")
