// Tether's icon helper: run on the phone with app_process (the way scrcpy runs its server), nothing installed.
// Prints one line per package: "<package> <base64 PNG>" (or "<package> -" when the icon can't be read).
// Usage: CLASSPATH=/data/local/tmp/tether-icons.jar app_process / IconDump <size px> <package>...
// Build: node apps/desktop/scripts/build-helper.mjs  →  resources/tether-icons.jar
import android.app.Application;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.util.DisplayMetrics;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Looper;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;

public final class IconDump {
  public static void main(String[] args) throws Exception {
    int size = Integer.parseInt(args[0]);
    Looper.prepareMainLooper();
    PackageManager pm = systemContext().getPackageManager();
    for (int i = 1; i < args.length; i++) {
      String pkg = args[i];
      try {
        // The app's own resources (the system Context carries none, so pm.getApplicationIcon falls over).
        ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
        Resources res = pm.getResourcesForApplication(ai);
        res.updateConfiguration(config(), metrics()); // the bare context has no density / SDK level: no icon file matches
        Drawable d = res.getDrawableForDensity(ai.icon, 640, null); // 640 = xxxhdpi: the sharpest one
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        d.setBounds(0, 0, size, size);
        d.draw(new Canvas(bmp));
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.PNG, 100, png);
        System.out.println(pkg + " " + Base64.encodeToString(png.toByteArray(), Base64.NO_WRAP));
      } catch (Throwable t) {
        System.out.println(pkg + " -");
        for (Throwable e = t; e != null; e = e.getCause()) System.err.println(pkg + ": " + e); // Tether logs it
      }
    }
  }

  private static Configuration config() {
    Configuration c = new Configuration();
    c.setToDefaults();
    c.densityDpi = 640;
    return c;
  }

  private static DisplayMetrics metrics() {
    DisplayMetrics m = new DisplayMetrics();
    m.setToDefaults();
    m.densityDpi = 640;
    m.density = 4f;
    m.scaledDensity = 4f;
    return m;
  }

  // The same trick as scrcpy's Workarounds.getSystemContext(): a bare ActivityThread hands out the system Context.
  private static Context systemContext() throws Exception {
    Class<?> at = Class.forName("android.app.ActivityThread");
    Constructor<?> c = at.getDeclaredConstructor();
    c.setAccessible(true);
    Object thread = c.newInstance();
    Field current = at.getDeclaredField("sCurrentActivityThread");
    current.setAccessible(true);
    current.set(null, thread);
    Method get = at.getDeclaredMethod("getSystemContext");
    Context ctx = (Context) get.invoke(thread);
    // Adaptive icons ask ActivityThread.currentApplication() for resources: give it one (scrcpy does the same).
    Application app = new Application();
    Method attach = ContextWrapper.class.getDeclaredMethod("attachBaseContext", Context.class);
    attach.setAccessible(true);
    attach.invoke(app, ctx);
    Field initial = at.getDeclaredField("mInitialApplication");
    initial.setAccessible(true);
    initial.set(thread, app);
    return ctx;
  }
}
