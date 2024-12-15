const express = require("express");
const expressWs = require("express-ws");
const mongoose = require("mongoose");
const session = require("express-session");
const path = require("path");
const bcrypt = require("bcrypt");
const User = require("./models/User");
const Poll = require("./models/Poll");

const PORT = 3000;
const MONGO_URI = "mongodb://127.0.0.1:27017/voting_app";
const app = express();
expressWs(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(
  session({
    secret: "voting-app-secret",
    resave: false,
    saveUninitialized: false,
  })
);

let connectedClients = [];

// WebSocket handling
app.ws("/ws", (socket) => {
  connectedClients.push(socket);

  socket.on("message", async (message) => {
    const { pollId, selectedOption } = JSON.parse(message);

    try {
      // Find the poll and update the selected option's votes
      const poll = await Poll.findById(pollId);
      const option = poll.options.find((opt) => opt.answer === selectedOption);
      if (option) option.votes += 1;

      // Save the updated poll
      await poll.save();

      // Notify all connected clients about the updated poll
      connectedClients.forEach((client) => {
        client.send(
          JSON.stringify({
            type: "voteUpdate",
            pollId,
            options: poll.options,
          })
        );
      });
    } catch (error) {
      console.error("Error processing vote:", error);
    }
  });

  socket.on("close", () => {
    connectedClients = connectedClients.filter((client) => client !== socket);
  });
});

// Home route
app.get("/", async (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }

  // Count the number of active polls
  const pollCount = await Poll.countDocuments();

  // Render the unauthenticated home page with pollCount
  res.render("index/unauthenticatedIndex", { pollCount });
});

// Login GET route: Render the login form
app.get("/login", (req, res) => {
  res.render("login", { errorMessage: null });
});

// Login POST route: Handle authentication
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });

  if (user && (await user.isValidPassword(password))) {
    req.session.user = { id: user._id, username: user.username };
    res.redirect("/dashboard"); // Redirect to dashboard after successful login
  } else {
    res.render("login", { errorMessage: "Invalid username or password." });
  }
});

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// Signup routes
app.get("/signup", (req, res) => {
  res.render("signup", { errorMessage: null });
});

app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = new User({ username, password });
    await user.save();
    req.session.user = { id: user._id, username: user.username };
    res.redirect("/dashboard");
  } catch (error) {
    res.render("signup", {
      errorMessage: "User already exists or invalid input.",
    });
  }
});

// Dashboard route
app.get("/dashboard", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const polls = await Poll.find();
  res.render("index/authenticatedIndex", { polls });
});

// Create Poll routes
app.get("/createPoll", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("createPoll");
});

app.post("/createPoll", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const { question, options } = req.body;
  const formattedOptions = Object.values(options).map((option) => ({
    answer: option,
    votes: 0,
  }));

  const poll = new Poll({
    question,
    options: formattedOptions,
    creator: req.session.user.id,
  });
  await poll.save();

  connectedClients.forEach((socket) =>
    socket.send(JSON.stringify({ type: "newPoll", poll }))
  );

  res.redirect("/dashboard");
});

// Profile route
app.get("/profile", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const user = await User.findById(req.session.user.id);
  const votedPolls = await Poll.find({ _id: { $in: user.votedPolls } });

  res.render("profile", { user, votedPolls });
});

// MongoDB Connection and Starting the Server
mongoose
  .connect(MONGO_URI)
  .then(() => {
    app.listen(PORT, async () => {
      console.log(`Server running on http://localhost:${PORT}`);

      // Dynamically import and open the browser
      import("open").then((open) => open.default(`http://localhost:${PORT}`));
    });
  })
  .catch((err) => console.error("MongoDB connection error:", err));
