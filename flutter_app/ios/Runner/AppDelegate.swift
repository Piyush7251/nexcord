import Contacts
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  private let contactsChannelName = "ai.nexconn.nexcord/contacts"
  private let mediaProjectionChannelName = "ai.nexconn.nexcord/media_projection_service"

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)

    if let messenger = resolveBinaryMessenger() {
      let mediaChannel = FlutterMethodChannel(
        name: mediaProjectionChannelName,
        binaryMessenger: messenger
      )
      mediaChannel.setMethodCallHandler { call, result in
        switch call.method {
        case "startService", "stopService":
          // iOS handles ReplayKit / WebRTC screen & audio without an Android foreground service
          result(true)
        default:
          result(FlutterMethodNotImplemented)
        }
      }

      let contactsChannel = FlutterMethodChannel(
        name: contactsChannelName,
        binaryMessenger: messenger
      )
      contactsChannel.setMethodCallHandler { [weak self] call, result in
        guard call.method == "getPhoneContacts" else {
          result(FlutterMethodNotImplemented)
          return
        }
        self?.handleGetPhoneContacts(result: result)
      }
    }

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  private func resolveBinaryMessenger() -> FlutterBinaryMessenger? {
    if let controller = window?.rootViewController as? FlutterViewController {
      return controller.binaryMessenger
    }
    if let registrar = self.registrar(forPlugin: "NexcordNativeBridge") {
      return registrar.messenger()
    }
    return nil
  }

  private func handleGetPhoneContacts(result: @escaping FlutterResult) {
    let store = CNContactStore()
    let status = CNContactStore.authorizationStatus(for: .contacts)
    // rawValue 4 matches CNAuthorizationStatus.limited (iOS 18+) without breaking older Xcode SDKs
    let isAuthorized = status == .authorized || status.rawValue == 4

    if isAuthorized {
      fetchContacts(store: store, result: result)
      return
    }

    if status == .notDetermined {
      store.requestAccess(for: .contacts) { [weak self] granted, error in
        if granted {
          self?.fetchContacts(store: store, result: result)
        } else {
          DispatchQueue.main.async {
            result(
              FlutterError(
                code: "PERMISSION_DENIED",
                message: error?.localizedDescription ?? "Contacts access denied",
                details: nil
              )
            )
          }
        }
      }
      return
    }

    result(
      FlutterError(
        code: "PERMISSION_DENIED",
        message: "Contacts permission denied. Enable Contacts in iOS Settings.",
        details: nil
      )
    )
  }

  private func fetchContacts(store: CNContactStore, result: @escaping FlutterResult) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let keys: [CNKeyDescriptor] = [
          CNContactGivenNameKey as CNKeyDescriptor,
          CNContactFamilyNameKey as CNKeyDescriptor,
          CNContactPhoneNumbersKey as CNKeyDescriptor,
        ]
        let request = CNContactFetchRequest(keysToFetch: keys)
        request.sortOrder = .givenName

        var entries: [[String: String]] = []
        try store.enumerateContacts(with: request) { contact, _ in
          let fullName = "\(contact.givenName) \(contact.familyName)"
            .trimmingCharacters(in: .whitespacesAndNewlines)
          for phoneNumber in contact.phoneNumbers {
            let value = phoneNumber.value.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if !value.isEmpty {
              entries.append([
                "name": fullName.isEmpty ? value : fullName,
                "phone": value,
              ])
            }
          }
        }

        entries.sort {
          ($0["name"] ?? "").localizedCaseInsensitiveCompare($1["name"] ?? "") == .orderedAscending
        }
        DispatchQueue.main.async {
          result(entries)
        }
      } catch {
        DispatchQueue.main.async {
          result(
            FlutterError(
              code: "CONTACTS_ERROR",
              message: error.localizedDescription,
              details: nil
            )
          )
        }
      }
    }
  }
}
