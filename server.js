require("dotenv").config();

const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const fs = require("fs");
const morgan = require("morgan");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("./models/User");
const axios = require("axios");

let chatMessages = [];

const app = express();
const accessLogStream = fs.createWriteStream(
    path.join(__dirname, "logs", "access.log"),
    { flags: "a"}
);

app.use(express.json());
app.use(express.urlencoded({ extended:true }));
app.use(morgan("combined", { stream: accessLogStream }));

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
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 }
}));

app.use((req, res, next) => {
    if (!req.session.cart) {
        req.session.cart = [];
    }
    next();
});


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

app.get("/cart/count", (req, res) => {
    res.json({
        count: req.session.cart.length
    });
});

app.post("/register", async (req, res) => {
    try {
        const username = req.body.username.trim();
        const email = req.body.email.trim().toLowerCase();
        const password = req.body.password.trim();

        if (!username || !email || !password) {
            return res.send("All Fields Required.");
        }

        if (password.length < 6) {
            return res.send("Password Must Be Atleast 6 Characters Long.");
        }

        if (username.length > 30) {
            return res.send("Username Can Not Be More Than 30 Characters.");
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {
            return res.send("Invalid Email Format.");
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.send("Email Already Registered.");
        }

        if (email.includes("$") || email.includes("{")) {
            return res.send("Invaild Input.");
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
        res.send(error.message);
    }
});

app.post("/login", async (req, res) => {
    try {
        const email = req.body.email.trim().toLowerCase();
        const password = req.body.password.trim();

        if (!email || !password) {
            return res.send("All Fields Required.");
        }

        const user = await User.findOne({ email });

        if (!user) {
            fs.appendFileSync(
                path.join(__dirname, "logs", "auth.log"),
                `${new Date().toISOString()} FAILED LOGIN - User Not Found: ${email}\n`
            );

            return res.send("User Not Found.");
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            fs.appendFileSync(
                path.join(__dirname, "logs", "auth.log"),
                `${new Date().toISOString()} FAILED LOGIN - Wrong Password: ${email}\n`
            );

            return res.send("Invalid Password.");
        }

        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.role = user.role;

        fs.appendFileSync(
            path.join(__dirname, "logs", "auth.log"),
            `${new Date().toISOString()} SUCCESSFUL LOGIN: ${email}\n`
        );

        res.redirect("/");

    } catch (error) {
        fs.appendFileSync(
            path.join(__dirname, "logs", "error.log"),
            `${new Date().toISOString()} LOGIN ERROR: ${email}\n`
        )

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
        fs.appendFileSync(
            path.join(__dirname, "logs", "access.log"),
            `${new Date().toISOString()} API REQUEST /api/tours from ${req.ip}\n`
        );

        const response = await axios.get(
            "https://app.ticketmaster.com/discovery/v2/events.json",
            {
                params: {
                    keyword: "BABYMETAL",
                    apikey: process.env.TICKETMASTER_KEY
                }
            }
        ); 
        fs.appendFileSync(
            path.join(__dirname, "logs", "access.log"),
            `${new Date().toISOString()} API SUCCESS /api/tours\n`
        );

        res.json(response.data);

    } catch (error) {
        fs.appendFileSync(
            path.join(__dirname, "logs", "error.log"),
            `${new Date().toISOString()} API ERROR /api/tours - ${error.message}\n`
        )

        console.log(error.response?.data || error.message);
        res.status(500).json({ error: "Failed to fetch tour data." });
    }

});

app.post("/cart/add", (req, res) => {
    const item = req.body.item;
    const price = req.body.price;

    req.session.cart.push({
        item, price
    });

    res.redirect("/merch");
});

app.get("/cart", (req, res) => {
    const cart = req.session.cart;

    let total = 0;

    let rows = "";

    cart.forEach((product, index) => {
        total += parseFloat(product.price);

        rows += `
            <tr>
                <td>${product.item}</td>
                <td>$${product.price}</td>
                <td>
                    <form action="/cart/remove" method="POST">
                        <input type="hidden" name="index" value="${index}">
                        <button type="submit">REMOVE</button>
                    </form>
                </td>
            </tr>    
        `;
    });

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Your Cart</title>
            <link rel="stylesheet" href="/css/style.css"
        </head>

        <body>
            <div class ="container">
                <h1>YOUR CART</h1>

                <table class="cart-table">
                    <tr>
                        <th>Item</th>
                        <th>Price</th>
                        <th>Remove</th>
                    </tr>

                    ${rows}

                </table>

                <h2>Total: $${total.toFixed(2)}</h2>

                <br>

                <a href="/merch">
                    <button>CONTINUE SHOPPING</button>
                </a>

            </div>
        </body>
        </html>
        `);
});

app.post("/cart/remove", (req, res) =>{
    const index = req.body.index;

    req.session.cart.splice(index, 1);

    res.redirect("/cart");
});

app.get("/community", requireLogin, (req, res) => {
    res.sendFile(
        path.join(__dirname, "community.html")
    );
});

app.get("/chat/messages", requireLogin, (req, res) => {
    res.json(chatMessages);
});

app.post("/chat/send", requireLogin, (req, res) => {
    const message = req.body.message.trim();

    if (message) {
        chatMessages.push({
            username: req.session.username,
            message: message
        });
    }
    res.json({ sucess: true });
});

app.listen(3000, "0.0.0.0", () => {
    console.log("Server Running on Port 3000");
});