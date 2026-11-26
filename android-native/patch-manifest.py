#!/usr/bin/env python3
"""Adds Notifye's background listener (service, boot receiver, permissions) to the generated
android/app/src/main/AndroidManifest.xml. Safe to run more than once."""
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'android/app/src/main/AndroidManifest.xml'
xml = open(path, encoding='utf-8').read()

permissions = [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.INTERNET',
]
for perm in permissions:
    if perm not in xml:
        xml = xml.replace('</manifest>', f'    <uses-permission android:name="{perm}" />\n</manifest>')

components = '''
        <service
            android:name=".NotifyeListenerService"
            android:exported="false"
            android:foregroundServiceType="remoteMessaging" />
        <receiver
            android:name=".NotifyeBootReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
'''
if 'NotifyeListenerService' not in xml:
    xml, n = re.subn(r'(\s*)</application>', components + r'\1</application>', xml, count=1)
    if n != 1:
        sys.exit('Could not find </application> in ' + path)

open(path, 'w', encoding='utf-8').write(xml)
print('Patched', path)
