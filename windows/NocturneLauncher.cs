using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// Compiles into Nocturne.exe with the .NET Framework compiler that ships with
// Windows. It starts the local Nocturne server in the background and opens the
// interface as a standalone Edge app window.
[assembly: AssemblyTitle("Nocturne")]
[assembly: AssemblyDescription("A private cinema for your Plex library")]
[assembly: AssemblyProduct("Nocturne")]
[assembly: AssemblyCompany("Nocturne")]
[assembly: AssemblyVersion("1.3.0.0")]
[assembly: AssemblyFileVersion("1.3.0.0")]
internal static class NocturneLauncher
{
    private const int DefaultPort = 8787;
    private static readonly string AppDir =
        Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr window, string text, string caption, uint type);

    private static int GetPort()
    {
        try
        {
            string file = Path.Combine(AppDir, "port.txt");
            int port;
            if (int.TryParse(File.ReadAllText(file).Trim(), out port) && port > 0 && port < 65536)
            {
                return port;
            }
        }
        catch
        {
            // Older installs and source runs use the default port.
        }

        return DefaultPort;
    }

    private static string GetAppUrl()
    {
        return "http://127.0.0.1:" + GetPort();
    }

    private static string GetControlUrl()
    {
        return "http://127.0.0.1:" + (GetPort() + 1);
    }

    private static bool IsRunning()
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(GetAppUrl() + "/api/health");
            request.Timeout = 2000;
            request.ReadWriteTimeout = 2000;
            request.Proxy = null;
            request.KeepAlive = false;

            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
            {
                if (response.StatusCode != HttpStatusCode.OK) return false;
                string body = reader.ReadToEnd();
                return body.IndexOf("\"product\":\"Nocturne\"", StringComparison.OrdinalIgnoreCase) >= 0;
            }
        }
        catch
        {
            return false;
        }
    }

    private static bool IsControlRunning()
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(GetControlUrl() + "/api/status");
            request.Timeout = 2000;
            request.ReadWriteTimeout = 2000;
            request.Proxy = null;
            request.KeepAlive = false;

            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
            {
                if (response.StatusCode != HttpStatusCode.OK) return false;
                string body = reader.ReadToEnd();
                return body.IndexOf("\"product\":\"Nocturne Control\"", StringComparison.OrdinalIgnoreCase) >= 0;
            }
        }
        catch
        {
            return false;
        }
    }

    private static bool StartAppFromControl()
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(GetControlUrl() + "/api/start");
            request.Method = "POST";
            request.ContentType = "application/json";
            request.Headers["X-Nocturne-Control"] = "1";
            request.Timeout = 35000;
            request.ReadWriteTimeout = 35000;
            request.Proxy = null;
            request.KeepAlive = false;

            byte[] body = Encoding.UTF8.GetBytes("{}");
            request.ContentLength = body.Length;
            using (Stream stream = request.GetRequestStream())
            {
                stream.Write(body, 0, body.Length);
            }

            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            {
                return response.StatusCode == HttpStatusCode.OK;
            }
        }
        catch (Exception error)
        {
            Log("Could not ask the control page to start the app: " + error.Message);
            return false;
        }
    }

    private static string FindNode()
    {
        string bundled = Path.Combine(AppDir, "runtime", "node.exe");
        if (File.Exists(bundled)) return bundled;

        string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        if (!string.IsNullOrEmpty(programFiles))
        {
            string installed = Path.Combine(programFiles, "nodejs", "node.exe");
            if (File.Exists(installed)) return installed;
        }

        string path = Environment.GetEnvironmentVariable("PATH");
        if (!string.IsNullOrEmpty(path))
        {
            string[] parts = path.Split(';');
            for (int index = 0; index < parts.Length; index++)
            {
                try
                {
                    string candidate = Path.Combine(parts[index].Trim(), "node.exe");
                    if (File.Exists(candidate)) return candidate;
                }
                catch
                {
                    // An invalid PATH entry should not stop the search.
                }
            }
        }

        return null;
    }

    private static string FindEdge()
    {
        string programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

        string[] candidates = new string[]
        {
            string.IsNullOrEmpty(programFilesX86) ? null : Path.Combine(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
            string.IsNullOrEmpty(programFiles) ? null : Path.Combine(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
            string.IsNullOrEmpty(localAppData) ? null : Path.Combine(localAppData, "Microsoft", "Edge", "Application", "msedge.exe")
        };

        for (int index = 0; index < candidates.Length; index++)
        {
            if (candidates[index] != null && File.Exists(candidates[index])) return candidates[index];
        }

        return null;
    }

    private static void Log(string message)
    {
        try
        {
            string logs = Path.Combine(AppDir, "logs");
            Directory.CreateDirectory(logs);
            File.AppendAllText(
                Path.Combine(logs, "launcher.log"),
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + message + Environment.NewLine,
                new UTF8Encoding(false));
        }
        catch
        {
            // Logging is best effort.
        }
    }

    private static void ShowError(string message)
    {
        Log(message);
        try
        {
            string logs = Path.Combine(AppDir, "logs");
            Directory.CreateDirectory(logs);
            string file = Path.Combine(logs, "launcher-error.txt");
            File.WriteAllText(
                file,
                "Nocturne could not start." + Environment.NewLine + Environment.NewLine + message +
                Environment.NewLine + Environment.NewLine +
                "Server log: " + Path.Combine(logs, "server.log") + Environment.NewLine,
                new UTF8Encoding(false));

            MessageBox(
                IntPtr.Zero,
                message + Environment.NewLine + Environment.NewLine +
                "Details were saved to:" + Environment.NewLine + file,
                "Nocturne",
                0x00000010); // MB_ICONERROR
        }
        catch
        {
            // There is nowhere left to report the problem.
        }
    }

    private static void StartServer(string node)
    {
        try
        {
            string logs = Path.Combine(AppDir, "logs");
            Directory.CreateDirectory(logs);

            // The launcher owns this small script so it always uses the Node
            // installation it just found, even if that path changes later.
            string script = Path.Combine(AppDir, "start-server.cmd");
            string content =
                "@echo off\r\n" +
                "cd /d \"%~dp0\"\r\n" +
                "\"" + node + "\" server\\control.js --nocturne-installed >> \"logs\\server.log\" 2>&1\r\n";
            File.WriteAllText(script, content, new UTF8Encoding(false));

            // Keep sign-in data outside the installed program folder so updating
            // or reinstalling Nocturne never removes the Plex connection.
            string dataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Nocturne",
                "data");
            Directory.CreateDirectory(dataDir);

            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = "cmd.exe";
            info.Arguments = "/c start-server.cmd";
            info.WorkingDirectory = AppDir;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            info.EnvironmentVariables["NOCTURNE_DATA_DIR"] = dataDir;
            info.EnvironmentVariables["PORT"] = GetPort().ToString();

            Process process = Process.Start(info);
            if (process == null)
            {
                ShowError("Windows did not start the Nocturne server process.");
                return;
            }

            Log("Started the Nocturne control server with " + node + " at " + GetControlUrl());
        }
        catch (Exception error)
        {
            ShowError("The Nocturne server could not be started: " + error.Message);
        }
    }

    private static void OpenAppWindow()
    {
        try
        {
            string edge = FindEdge();
            if (edge != null)
            {
                Process.Start(edge, "--app=" + GetAppUrl());
                return;
            }

            Process.Start(GetAppUrl());
        }
        catch (Exception error)
        {
            ShowError("Nocturne is running, but its window could not be opened: " + error.Message);
        }
    }

    [STAThread]
    private static void Main(string[] args)
    {
        bool background = false;
        int delaySeconds = 0;

        for (int index = 0; index < args.Length; index++)
        {
            if (string.Equals(args[index], "--background", StringComparison.OrdinalIgnoreCase))
            {
                background = true;
            }
            else if (string.Equals(args[index], "--delay", StringComparison.OrdinalIgnoreCase) && index + 1 < args.Length)
            {
                int.TryParse(args[index + 1], out delaySeconds);
            }
        }

        if (delaySeconds < 0) delaySeconds = 0;
        if (delaySeconds > 120) delaySeconds = 120;

        if (delaySeconds > 0)
        {
            Log("Waiting " + delaySeconds + " seconds before starting so Plex can settle.");
            Thread.Sleep(delaySeconds * 1000);
        }

        if (!IsRunning())
        {
            if (IsControlRunning())
            {
                Log("The control page is running; asking it to start the app.");
                if (!StartAppFromControl())
                {
                    ShowError(
                        "The Nocturne control page is running, but it could not start the app." + Environment.NewLine +
                        "Open " + GetControlUrl() + " to start it, or check logs\\server.log.");
                    return;
                }
            }
            else
            {
                string node = FindNode();
                if (node == null)
                {
                    ShowError(
                        "Node.js 22 or newer is required, but Node was not found." + Environment.NewLine +
                        "Install it from https://nodejs.org, then run the Nocturne installer again.");
                    return;
                }

                StartServer(node);
            }

            bool ready = false;
            for (int attempt = 0; attempt < 60; attempt++)
            {
                Thread.Sleep(500);
                if (IsRunning())
                {
                    ready = true;
                    break;
                }
            }

            if (!ready)
            {
                ShowError(
                    "The local Nocturne server did not answer after 30 seconds." + Environment.NewLine +
                    "Open " + GetControlUrl() + " or logs\\server.log to see what happened.");
                return;
            }
        }

        if (!background)
        {
            OpenAppWindow();
        }
    }
}
