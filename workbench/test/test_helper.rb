# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "fileutils"
require "json"
require "yaml"

$LOAD_PATH.unshift(File.expand_path("../lib", __dir__))

require "workbench"

# Mixin for tests that need an isolated workbench home directory.
module WorkbenchTestSetup
  def setup_workbench
    @wb_dir = Dir.mktmpdir("wb-test")
    @worktree_base = Dir.mktmpdir("wb-worktrees")
    ENV["WORKBENCH_HOME"] = @wb_dir
    @store = Workbench::Store.new(home: @wb_dir)
    @registry = Workbench::Registry.new(store: @store, worktree_base: @worktree_base)
  end

  def teardown_workbench
    FileUtils.rm_rf(@wb_dir)
    FileUtils.rm_rf(@worktree_base)
    ENV.delete("WORKBENCH_HOME")
  end
end
