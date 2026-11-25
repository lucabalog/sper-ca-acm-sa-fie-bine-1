#!/usr/bin/env ruby
# Wires native Google Sign-In (@capacitor-firebase/authentication) into the generated
# Capacitor iOS project. Run after `npx cap sync ios` and after setup-ios-widget.rb.
#
# Requires:
#   - GoogleService-Info.plist at the repo root (from the Firebase console, iOS app
#     with bundle ID com.notifye.app, Google sign-in enabled)
#   - @capacitor-firebase/authentication listed in package.json and installed
require 'fileutils'
require 'xcodeproj'

GSI_SRC = 'GoogleService-Info.plist'
PLUGIN_DIR = 'node_modules/@capacitor-firebase/authentication'
APP_BUNDLE_ID = 'com.notifye.app'

abort "#{GSI_SRC} not found at repo root" unless File.exist?(GSI_SRC)
abort "#{PLUGIN_DIR} is not installed" unless Dir.exist?(PLUGIN_DIR)

gsi = Xcodeproj::Plist.read_from_path(GSI_SRC)
reversed_client_id = gsi['REVERSED_CLIENT_ID'].to_s
if reversed_client_id.empty?
  abort 'GoogleService-Info.plist has no REVERSED_CLIENT_ID. Enable Google sign-in in the ' \
        'Firebase console, then download GoogleService-Info.plist again.'
end
if gsi['BUNDLE_ID'] && gsi['BUNDLE_ID'] != APP_BUNDLE_ID
  warn "warning: GoogleService-Info.plist BUNDLE_ID is #{gsi['BUNDLE_ID']}, app is #{APP_BUNDLE_ID}"
end

# 1. Bundle GoogleService-Info.plist into the App target (FirebaseApp.configure() reads it).
FileUtils.cp(GSI_SRC, 'ios/App/App/GoogleService-Info.plist')
project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app_target = project.targets.find { |t| t.name == 'App' }
abort 'Could not find App target' unless app_target
app_group = project.main_group.find_subpath('App', true)
gsi_ref = app_group.files.find { |f| File.basename(f.path.to_s) == 'GoogleService-Info.plist' } ||
          app_group.new_file('GoogleService-Info.plist')
app_target.resources_build_phase.add_file_reference(gsi_ref, true)
project.save

# 2. Register the reversed client ID as a URL scheme so the Google sign-in callback returns to the app.
info_path = 'ios/App/App/Info.plist'
info = Xcodeproj::Plist.read_from_path(info_path)
url_types = (info['CFBundleURLTypes'] ||= [])
unless url_types.any? { |t| Array(t['CFBundleURLSchemes']).include?(reversed_client_id) }
  url_types << { 'CFBundleURLSchemes' => [reversed_client_id] }
end
Xcodeproj::Plist.write_to_path(info, info_path)

# 3. Add the Google provider subspec to the Podfile and reinstall pods.
podfile_path = 'ios/App/Podfile'
podfile = File.read(podfile_path)
unless podfile.include?('CapacitorFirebaseAuthentication/Google')
  pod_line = "  pod 'CapacitorFirebaseAuthentication/Google', :path => '../../#{PLUGIN_DIR}'"
  podfile.sub!('# Add your Pods here', "# Add your Pods here\n#{pod_line}") ||
    abort("Could not find '# Add your Pods here' in #{podfile_path}")
  File.write(podfile_path, podfile)
  # The first `cap sync` locked versions (e.g. GTMSessionFetcher 4.x) that conflict with
  # GoogleSignIn's constraints, so re-resolve from scratch.
  FileUtils.rm_f('ios/App/Podfile.lock')
end
Dir.chdir('ios/App') { system('pod', 'install') || abort('pod install failed') }

puts 'Configured native Google Sign-In (CapacitorFirebaseAuthentication/Google).'
