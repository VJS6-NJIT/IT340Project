require("dotenv").config();

const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("./models/User");
const axios = require("axios");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended:true }));

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);


app.use(morgan("dev"));

app.use(session({
    secret: "foxgodsecret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true }
}));

app.use(express.static(__dirname));

function requireLogin(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect("/login");
    }
}

function requireRole(role) {
    return function(req, res, next) {
        if (req.session.role === role || req.session.role === "foxgod") {
            next();
        } else {
            res.send("Access Denied.");
        }
    };
}

mongoose.connect("mongodb://127.0.0.1:27017/BandTracker")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

app.get("/", (req,res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/login", (req,res) => {
    res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/register", (req,res) => {
    res.sendFile(path.join(__dirname, "register.html"));
});

app.get("/tour", (req,res) => {
    res.sendFile(path.join(__dirname, "tour.html"));
});

app.get("/merch", (req,res) => {
    res.sendFile(path.join(__dirname, "merch.html"));
});

app.post("/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.send("Email Already Registered.");
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            username,
            email,
            password: hashedPassword
        });

        await newUser.save();

        res.send("Registration Successful.");
    } catch (error) {
        console.log(error);
        res.send("Registration Failed. Please Try Again.");
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });

        if (!user) {
            return res.send("User Not Found.");
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.send("Invalid Password.");
        }

        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.role = user.role;

        res.redirect("/");

    } catch (error) {
        console.log(error);
        res.send("Login Failed.");
    }

});

app.get("/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            return res.send("Logout Failed.")
        }

        res.redirect("/");
    });
});

app.get("/dashboard", requireLogin, (req, res) => {
    res.send("Welcome to your dashboard " + req.session.username);
});

app.get("/metal-panel", requireLogin, requireRole("metalspirit"), (req, res) => {
    res.send("Welcome Metal Spirit");
});

app.get("/fox-panel", requireLogin, requireRole("foxgod"), (req, res) => {
    res.send("Welcome Fox God");
});

app.get("/api/tours", async (req, res) => {
    try {
        const response = await axios.get(
            "https://app.ticketmaster.com/discovery/v2/events.json",
            {
                params: {
                    keyword: "BABYMETAL",
                    apikey: process.env.TICKETMASTER_KEY
                }
            }
        ); 

        res.json(response.data);

    } catch (error) {
        console.log(error.response?.data || error.message);
        res.status(500).json({ error: "Failed to fetch tour data." });
    }

});

app.listen(3000, "0.0.0.0", () => {
    console.log("Server Running on Port 3000");
});