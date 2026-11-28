package ai.nexconn.nexcord_flutter

import android.Manifest
import android.content.pm.PackageManager
import android.provider.ContactsContract
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "ai.nexconn.nexcord/media_projection_service"
    private val CONTACTS_CHANNEL = "ai.nexconn.nexcord/contacts"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "startService" -> {
                    try {
                        MediaProjectionService.start(applicationContext)
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("START_FAILED", e.message, null)
                    }
                }
                "stopService" -> {
                    try {
                        MediaProjectionService.stop(applicationContext)
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("STOP_FAILED", e.message, null)
                    }
                }
                else -> result.notImplemented()
            }
        }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CONTACTS_CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "getPhoneContacts") {
                val granted = ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.READ_CONTACTS
                ) == PackageManager.PERMISSION_GRANTED
                if (!granted) {
                    result.error("PERMISSION_DENIED", "READ_CONTACTS permission not granted", null)
                    return@setMethodCallHandler
                }
                Thread {
                    try {
                        val contacts = ArrayList<Map<String, String>>()
                        val projection = arrayOf(
                            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                            ContactsContract.CommonDataKinds.Phone.NUMBER
                        )
                        val cursor = contentResolver.query(
                            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                            projection,
                            null,
                            null,
                            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
                        )
                        cursor?.use {
                            val nameIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                            val phoneIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                            while (it.moveToNext()) {
                                val name = if (nameIdx >= 0) it.getString(nameIdx)?.trim() ?: "" else ""
                                val phone = if (phoneIdx >= 0) it.getString(phoneIdx)?.trim() ?: "" else ""
                                if (phone.isNotEmpty()) {
                                    contacts.add(mapOf("name" to name, "phone" to phone))
                                }
                            }
                        }
                        runOnUiThread { result.success(contacts) }
                    } catch (e: Exception) {
                        runOnUiThread { result.error("CONTACTS_ERROR", e.message, null) }
                    }
                }.start()
            } else {
                result.notImplemented()
            }
        }
    }
}
