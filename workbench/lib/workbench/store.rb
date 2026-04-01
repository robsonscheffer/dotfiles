# frozen_string_literal: true

require 'yaml'
require 'json'
require 'fileutils'
require 'date'

module Workbench
  # Atomic YAML persistence with file locking.
  # All mutations to active.yaml go through this class.
  class Store
    attr_reader :registry_path, :lock_path

    def initialize(home: Workbench.home)
      @registry_path = File.join(home, 'active.yaml')
      @lock_path     = File.join(home, '.active.lock')
    end

    def read
      return { 'tickets' => [] } unless File.exist?(@registry_path)
      data = YAML.load_file(@registry_path, permitted_classes: [Date])
      data.is_a?(Hash) && data['tickets'].is_a?(Array) ? data : { 'tickets' => [] }
    end

    def write(data)
      FileUtils.mkdir_p(File.dirname(@registry_path))
      FileUtils.mkdir_p(File.dirname(@lock_path))
      File.open(@lock_path, File::CREAT | File::RDWR) do |lock|
        lock.flock(File::LOCK_EX)
        tmp = "#{@registry_path}.tmp"
        File.write(tmp, YAML.dump(data))
        File.rename(tmp, @registry_path)
      end
    end

    # Read-modify-write with exclusive lock.
    # Yields the full data hash; caller mutates in place.
    def mutate
      data = read
      yield data
      write(data)
      data
    end

    def tickets
      read['tickets']
    end

    def find_ticket(id)
      tickets.find { |t| t['id'] == id }
    end

    def find_by_path(path)
      resolved = begin
        File.realpath(path)
      rescue StandardError
        path
      end
      tickets.find { |t| t['worktree'] == resolved }
    end
  end
end
