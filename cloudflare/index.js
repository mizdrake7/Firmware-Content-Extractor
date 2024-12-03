export default {
  async fetch(req, env) {
    if (req.method === "GET" && !req.url.includes("?")) {
      return new Response(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>FCE Worker</title>
        </head>
        <body>
          <h1>Firmware Content Extractor</h1>
          <form method="GET" action="/">
            <label for="get">Choose an option (boot_img, settings_apk, init_boot_img):</label><br>
            <input type="text" id="get" name="get" required><br><br>
            <label for="url">Enter the URL (must end with .zip):</label><br>
            <input type="text" id="url" name="url" required><br><br>
            <button type="submit">Submit</button>
          </form>
        </body>
        </html>
      `, { headers: { "Content-Type": "text/html" }, status: 200 });
    }

    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const get = urlParams.get('get');
    const url = urlParams.get('url');

    if (!get || !url) {
      return new Response("\nMissing parameters!\n\nPlease fill out the form to provide the required values.\n", { status: 400 });
    }

    if (get !== "boot_img" && get !== "settings_apk" && get !== "init_boot_img") {
      return new Response("\nOnly 'boot_img', 'settings_apk', and 'init_boot_img' are allowed for 'get' parameter.\n", { status: 400 });
    }

    if (!url.endsWith(".zip")) {
      return new Response("\nOnly .zip URLs are supported.\n", { status: 400 });
    }

    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      return new Response("\nThe provided URL is not accessible.\n", { status: 400 });
    }

    const fileName = url.split('/').pop();
    const combinedBasename = `${get}_${fileName}`;
    const finalUrl = `https://github.com/offici5l/Firmware-Content-Extractor/releases/download/${get}/${combinedBasename}`;

    const headers = {
      "Authorization": `token ${env.GTKK}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "Cloudflare Worker"
    };

    const BaseUrl = "https://api.github.com/repos/offici5l/Firmware-Content-Extractor/actions/workflows/FCE.yml";

    const githubDispatchUrl = `${BaseUrl}/dispatches`;
    const TRACK_URL = `${BaseUrl}/runs`;

    try {
      const finalUrlResponse = await fetch(finalUrl, { method: 'HEAD' });
      if (finalUrlResponse.ok) {
        return new Response(`\nresult: available\nlink: ${finalUrl}\n`, { status: 200 });
      }

      const track = Date.now().toString();
      const data = { ref: "main", inputs: { get, url, track } };

      const githubResponse = await fetch(githubDispatchUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(data)
      });

      if (githubResponse.ok) {
        while (true) {
          const trackResponse = await fetch(TRACK_URL, { method: "GET", headers });
          if (trackResponse.ok) {
            const workflowRuns = await trackResponse.json();
            for (const jobUrl of workflowRuns.workflow_runs.map(run => run.url + "/jobs")) {
              const jobResponse = await fetch(jobUrl, { method: "GET", headers });
              if (jobResponse.ok) {
                const jobData = await jobResponse.json();
                const job = jobData.jobs.find(job => job.name === track);
                if (job) {
                  return new Response(`\n\nIt will be available at this link: ${finalUrl}\n\nTrack progress: ${job.html_url}\n\n`, { status: 200 });
                }
              }
            }
          }
        }
      } else {
        const githubResponseText = await githubResponse.text();
        return new Response(`GitHub Response Error: ${githubResponseText}`, { status: 500 });
      }
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
};