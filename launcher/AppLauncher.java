import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.awt.Desktop;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;

/**
 * Self-contained launcher for the Compliance Portal Angular SPA.
 * Serves the embedded static build over HTTP on localhost and opens the
 * default browser. No Node, npm or git required -- only a JRE.
 */
public class AppLauncher {

    private static final int DEFAULT_PORT = 8080;

    public static void main(String[] args) throws IOException {
        int port = resolvePort(args);

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/", new SpaHandler());
        server.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(4));
        server.start();

        String url = "http://127.0.0.1:" + port + "/";
        System.out.println("Compliance Portal corriendo en " + url);
        System.out.println("Cerrar esta ventana detiene la aplicación.");

        openBrowser(url);
    }

    private static int resolvePort(String[] args) {
        if (args.length > 0) {
            try {
                return Integer.parseInt(args[0]);
            } catch (NumberFormatException ignored) {
                // fall through to default
            }
        }
        return DEFAULT_PORT;
    }

    private static void openBrowser(String url) {
        try {
            if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().browse(URI.create(url));
                return;
            }
        } catch (IOException | UnsupportedOperationException ignored) {
            // fall through to OS-specific attempt (Windows)
        }
        try {
            new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", url).start();
        } catch (IOException ignored) {
            // best effort only
        }
    }

    private static final class SpaHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/") || path.isEmpty()) {
                path = "/index.html";
            }

            // Resolve against the embedded /browser resources.
            String resource = "/browser" + path;

            InputStream in = AppLauncher.class.getResourceAsStream(resource);
            if (in == null) {
                // SPA fallback: unknown front-end route -> serve index.html.
                in = AppLauncher.class.getResourceAsStream("/browser/index.html");
                resource = "/browser/index.html";
            }

            if (in == null) {
                byte[] notFound = "Not Found".getBytes("UTF-8");
                exchange.sendResponseHeaders(404, notFound.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(notFound);
                }
                return;
            }

            byte[] body = toBytes(in);
            String contentType = contentType(resource);
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }
        }

        private byte[] toBytes(InputStream in) throws IOException {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = in.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
            }
            return buffer.toByteArray();
        }

        private String contentType(String resource) {
            String lower = resource.toLowerCase();
            if (lower.endsWith(".html")) return "text/html; charset=utf-8";
            if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
            if (lower.endsWith(".css")) return "text/css; charset=utf-8";
            if (lower.endsWith(".json")) return "application/json; charset=utf-8";
            if (lower.endsWith(".svg")) return "image/svg+xml";
            if (lower.endsWith(".png")) return "image/png";
            if (lower.endsWith(".ico")) return "image/x-icon";
            if (lower.endsWith(".woff2")) return "font/woff2";
            if (lower.endsWith(".woff")) return "font/woff";
            if (lower.endsWith(".ttf")) return "font/ttf";
            if (lower.endsWith(".map")) return "application/json";
            return "application/octet-stream";
        }
    }
}
