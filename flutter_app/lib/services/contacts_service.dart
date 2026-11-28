import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

class PhoneContactEntry {
  final String name;
  final String phone;

  const PhoneContactEntry({
    required this.name,
    required this.phone,
  });

  Map<String, String> toMap() => {
        'name': name,
        'phone': phone,
      };
}

class ContactsService {
  ContactsService._();
  static final ContactsService instance = ContactsService._();

  static const MethodChannel _channel =
      MethodChannel('ai.nexconn.nexcord/contacts');

  Future<bool> requestContactsPermission() async {
    final current = await Permission.contacts.status;
    if (current.isGranted || current.isLimited) {
      return true;
    }
    final requested = await Permission.contacts.request();
    return requested.isGranted || requested.isLimited;
  }

  Future<List<PhoneContactEntry>> loadDeviceContacts() async {
    final granted = await requestContactsPermission();
    if (!granted) {
      throw Exception(
        'Contacts permission denied. Allow Contacts access in device Settings or enter phone numbers manually.',
      );
    }

    final raw = await _channel.invokeMethod<List<dynamic>>('getPhoneContacts');
    if (raw == null) return const [];

    final entries = <PhoneContactEntry>[];
    final seenPhones = <String>{};

    for (final item in raw) {
      if (item is Map) {
        final name = item['name']?.toString().trim() ?? '';
        final phone = item['phone']?.toString().trim() ?? '';
        final digits = phone.replaceAll(RegExp(r'\D'), '');
        if (digits.length < 6) continue;
        final key =
            digits.length > 10 ? digits.substring(digits.length - 10) : digits;
        if (seenPhones.add(key)) {
          entries.add(
            PhoneContactEntry(
              name: name.isNotEmpty ? name : phone,
              phone: phone,
            ),
          );
        }
      }
    }

    return entries;
  }
}
