const fs = require("fs");
const http = require("http");
const https = require("https");
const [{ APIKEY }] = require("./auth/credentials.json");
const port = 3000;

const cachedQuoteFilePath = "auth/cachedQuote.json";
const server = http.createServer();
server.on("listening", listen_handler);
server.listen(port);

function listen_handler() {
    console.log(`Now Listening on Port ${port}`);
}

server.on("request", request_handler);

function request_handler(req, res) {
    console.log(`New Request from ${req.socket.remoteAddress} for ${req.url}`);
    if (req.url === "/") {
        const form = fs.createReadStream("html/index.html");
        res.writeHead(200, { "Content-Type": "text/html" });
        form.pipe(res);
    } else if (req.url.startsWith("/cat_and_quote")) {
        const user_input = new URL(req.url, `https://${req.headers.host}`).searchParams;
        const limit = user_input.get("limit");
        cat_api(limit, res);
    } else {
        not_found(res);
    }
}

function not_found(res) {
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(`<h1>404 Not Found</h1>`);
}

function cat_api(limit, res) {
    if (isNaN(limit) || limit < 1 || limit > 20) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Error: Limit must be between 1 and 20");
        return;
    }

    const apiEndpoint = "https://api.thecatapi.com/v1/images/search";

    const queryParams = new URLSearchParams({ limit }).toString();
    const apiUrl = `${apiEndpoint}?${queryParams}`;

    const options = {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": APIKEY,
        },
    };

    https.get(apiUrl, options, (catApiStream) => {
        process_stream(catApiStream, (body) => {
            anime_quote(body, res);
        });
    });
}

function anime_quote(body, res) {
    const catImages = JSON.parse(body).map((item) => item.url);
    https.get("https://animechan.xyz/api/random", (animeQuoteStream) => {
        process_stream(animeQuoteStream, (secondApiResponse) => {
            printResult(secondApiResponse, catImages, res);
        });
    });
}

function printResult(secondApiResponse, catImages, res) {
    let animeQuote = null;

    const responseText = secondApiResponse.trim();

    if (responseText.includes("Too Many Requests")) {
        const cachedQuotesData = fs.readFileSync(cachedQuoteFilePath, "utf8");
        const cachedQuotes = JSON.parse(cachedQuotesData);

        if (cachedQuotes.length > 0) {
            const randomIndex = Math.floor(Math.random() * cachedQuotes.length);
        animeQuote = cachedQuotes[randomIndex].quote;
        }
    } else {
        const responseData = JSON.parse(responseText);
        animeQuote = responseData.quote;

        const cachedQuotesData = fs.readFileSync(cachedQuoteFilePath, "utf8");
        const cachedQuotes = JSON.parse(cachedQuotesData);

        cachedQuotes.push({ quote: animeQuote });

        fs.writeFileSync(cachedQuoteFilePath, JSON.stringify(cachedQuotes, null, 2));
    }

    const htmlContent = generateHtml({ animeQuote, catImages });

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(htmlContent);
}

function process_stream(stream, callback) {
    let body = "";
    stream.on("data", (chunk) => (body += chunk));
    stream.on("end", () => callback(body));
}

function generateHtml(data) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>API Data</title>
            <style>
                body{
                    background-color: aquamarine;
                }
            </style>
        </head>
        <body>
            <h1>Anime Quote:</h1>
            <h3>${data.animeQuote}</h3>
            <h1>Cat Images:</h1>
            <ul>
                ${data.catImages.map((image) => `<li><img src="${image}" alt="Cat"></li>`).join("")}
            </ul>
        </body>
        </html>
    `;
}