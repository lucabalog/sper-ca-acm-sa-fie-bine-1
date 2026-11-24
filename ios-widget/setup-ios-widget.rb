#!/usr/bin/env ruby
require 'fileutils'
require 'xcodeproj'

project_path = 'ios/App/App.xcodeproj'
unless File.exist?(project_path)
  abort "Xcode project not found at #{project_path}"
end

project = Xcodeproj::Project.open(project_path)
app_target = project.targets.find { |t| t.name == 'App' }
abort 'Could not find App target' unless app_target

app_group = project.main_group.find_subpath('App', true)

# Copy Capacitor widget bridge plugin files into App target
bridge_dir = 'ios/App/App'
FileUtils.cp('ios-widget/NotifyeWidgetBridge.swift', "#{bridge_dir}/NotifyeWidgetBridge.swift")
FileUtils.cp('ios-widget/NotifyeWidgetBridge.m', "#{bridge_dir}/NotifyeWidgetBridge.m")
FileUtils.cp('ios-widget/App.entitlements', "#{bridge_dir}/App.entitlements")

%w[NotifyeWidgetBridge.swift NotifyeWidgetBridge.m].each do |fname|
  existing = app_group.files.find { |f| f.path == fname || File.basename(f.path.to_s) == fname }
  file_ref = existing || app_group.new_file(fname)
  unless app_target.source_build_phase.files_references.include?(file_ref)
    app_target.source_build_phase.add_file_reference(file_ref)
  end
end

unless app_group.files.any? { |f| File.basename(f.path.to_s) == 'App.entitlements' }
  app_group.new_file('App.entitlements')
end

app_target.build_configurations.each do |cfg|
  cfg.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
end

# Create NotifyeWidgets extension target
widget_dir = 'ios/App/NotifyeWidgets'
FileUtils.mkdir_p(widget_dir)
FileUtils.cp('ios-widget/NotifyeWidget.swift', "#{widget_dir}/NotifyeWidget.swift")
FileUtils.cp('ios-widget/WidgetInfo.plist', "#{widget_dir}/Info.plist")
FileUtils.cp('ios-widget/NotifyeWidgets.entitlements', "#{widget_dir}/NotifyeWidgets.entitlements")

widget_target = project.targets.find { |t| t.name == 'NotifyeWidgets' }
unless widget_target
  widget_target = project.new_target(:app_extension, 'NotifyeWidgets', :ios, '17.0')
end

widget_group = project.main_group.find_subpath('NotifyeWidgets', true)
swift_ref = widget_group.files.find { |f| File.basename(f.path.to_s) == 'NotifyeWidget.swift' } ||
            widget_group.new_file('NotifyeWidget.swift')
plist_ref = widget_group.files.find { |f| File.basename(f.path.to_s) == 'Info.plist' } ||
            widget_group.new_file('Info.plist')
ent_ref = widget_group.files.find { |f| File.basename(f.path.to_s) == 'NotifyeWidgets.entitlements' } ||
          widget_group.new_file('NotifyeWidgets.entitlements')

widget_group.set_source_tree('<group>')
widget_group.set_path('NotifyeWidgets')

unless widget_target.source_build_phase.files_references.include?(swift_ref)
  widget_target.source_build_phase.add_file_reference(swift_ref)
end

widget_target.build_configurations.each do |cfg|
  cfg.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.notifye.app.widgets'
  cfg.build_settings['INFOPLIST_FILE'] = 'NotifyeWidgets/Info.plist'
  cfg.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'NotifyeWidgets/NotifyeWidgets.entitlements'
  cfg.build_settings['SWIFT_VERSION'] = '5.0'
  cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  cfg.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  cfg.build_settings['SKIP_INSTALL'] = 'YES'
  cfg.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  cfg.build_settings['MARKETING_VERSION'] = '1.0'
  cfg.build_settings['CURRENT_PROJECT_VERSION'] = '1'
end

# Link WidgetKit & SwiftUI frameworks
%w[WidgetKit SwiftUI AppIntents].each do |fw|
  widget_target.frameworks_build_phase.add_file_reference(
    project.frameworks_group.new_file("System/Library/Frameworks/#{fw}.framework", :sdk_root),
    true
  )
end

# Embed NotifyeWidgets.appex into App target PlugIns
unless app_target.dependencies.any? { |d| d.target == widget_target }
  app_target.add_dependency(widget_target)
end

embed_phase = app_target.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' }
unless embed_phase
  embed_phase = app_target.new_copy_files_build_phase('Embed Foundation Extensions')
  embed_phase.dst_subfolder_spec = '13'
end

unless embed_phase.files_references.include?(widget_target.product_reference)
  build_file = embed_phase.add_file_reference(widget_target.product_reference)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end

project.save
puts 'Configured NotifyeWidgets iOS 17+ WidgetKit extension cleanly.'
