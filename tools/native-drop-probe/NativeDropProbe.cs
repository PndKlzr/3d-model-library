using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;

internal sealed class NativeDropProbeForm : Form
{
    private readonly TextBox output;
    private readonly string logPath;

    public NativeDropProbeForm(string logPath)
    {
        this.logPath = logPath;
        Text = "Native File Drop Probe";
        Width = 760;
        Height = 520;
        StartPosition = FormStartPosition.CenterScreen;
        AllowDrop = true;
        KeyPreview = true;

        output = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            Font = new System.Drawing.Font("Consolas", 10),
            Text = "Drop files here. Press Esc to close.\r\nLog: " + logPath
        };

        Controls.Add(output);
        DragEnter += OnDragEnter;
        DragDrop += OnDragDrop;
        KeyDown += delegate(object sender, KeyEventArgs eventArgs)
        {
            if (eventArgs.KeyCode == Keys.Escape)
            {
                Close();
            }
        };
    }

    private void OnDragEnter(object sender, DragEventArgs eventArgs)
    {
        eventArgs.Effect = eventArgs.Data != null &&
                           eventArgs.Data.GetDataPresent(DataFormats.FileDrop, true) &&
                           (eventArgs.AllowedEffect & DragDropEffects.Copy) == DragDropEffects.Copy
            ? DragDropEffects.Copy
            : DragDropEffects.None;

        output.Text = BuildReport("ENTER", eventArgs, new string[0]);
    }

    private void OnDragDrop(object sender, DragEventArgs eventArgs)
    {
        string[] files = eventArgs.Data == null
            ? new string[0]
            : eventArgs.Data.GetData(DataFormats.FileDrop, true) as string[] ?? new string[0];
        string report = BuildReport("DROP", eventArgs, files);
        output.Text = report;
        File.WriteAllText(logPath, report, new UTF8Encoding(false));
    }

    private static string BuildReport(string phase, DragEventArgs eventArgs, string[] files)
    {
        string[] formats = eventArgs.Data == null
            ? new string[0]
            : eventArgs.Data.GetFormats(false).OrderBy(value => value).ToArray();

        StringBuilder report = new StringBuilder();
        report.AppendLine("Phase: " + phase);
        report.AppendLine("AllowedEffect: " + eventArgs.AllowedEffect);
        report.AppendLine("SelectedEffect: " + eventArgs.Effect);
        report.AppendLine("FormatCount: " + formats.Length);

        foreach (string format in formats)
        {
            report.AppendLine("Format: " + format);
        }

        report.AppendLine("FileCount: " + files.Length);

        foreach (string file in files)
        {
            report.AppendLine("File: " + Path.GetFullPath(file));
        }

        return report.ToString();
    }
}

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        string logPath = args.Length > 0
            ? Path.GetFullPath(args[0])
            : Path.Combine(Path.GetTempPath(), "ModelLibraryNativeDropProbe.log");

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new NativeDropProbeForm(logPath));
    }
}
