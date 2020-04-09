require("dotenv").config();
const express = require("express");
const puppeteer = require("puppeteer");
const htmlparser = require("htmlparser");
const crypto = require("crypto");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const app = express();
const cors = require("cors");
const request = require("request");
const http = require("http").createServer(app);
const bodyParser = require("body-parser");
const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectId;
var privateKey = fs.readFileSync("key/private.key");
var publicKey = fs.readFileSync("key/public.key");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());
http.listen(process.env.PORT, function () {
  console.log("listening on port " + process.env.PORT);
});

var url = process.env.DB_HOST;
var options = {
  keepAlive: 300000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000,
  useNewUrlParser: true,
  useUnifiedTopology: true,
};

function findInDB(query, coll, callback) {
  MongoClient.connect(url, options, function (err, db) {
    if (err) throw err;
    var dbo = db.db("menu");
    dbo
      .collection(coll)
      .find(query)
      .toArray(function (err, result) {
        if (err) throw err;
        if (typeof callback == "function") {
          callback(result);
        }
      });
  });
}

function insertOneInDB(coll, object, callback) {
  MongoClient.connect(url, options, function (err, db) {
    var dbo = db.db("menu");
    dbo.collection(coll).insertOne(object, function (err, res) {
      if (err) throw err;
      if (typeof callback == "function") {
        callback();
      }
      db.close();
    });
  });
}

function updateOneInDB(query, coll, update, callback) {
  MongoClient.connect(url, options, function (err, db) {
    if (err) throw err;
    var dbo = db.db("menu");
    dbo.collection(coll).updateOne(query, update, function (err, res) {
      if (err) throw err;
      if (typeof callback == "function") {
        callback();
      }
      db.close();
    });
  });
}

function removeFromDB(query, coll, callback) {
  MongoClient.connect(url, options, function (err, db) {
    if (err) throw err;
    var dbo = db.db("menu");
    dbo.collection(coll).deleteMany(query, function (err, res) {
      if (err) throw err;
      if (typeof callback == "function") {
        callback();
      }
      db.close();
    });
  });
}

async function menuToDatabase() {
  const browser = await puppeteer.launch();
  const mensas = [
    {
      link:
        "https://web.archive.org/web/20191002211533/https://www.stw-ma.de/speiseplan_mensaria_metropol.html",
      place: "mensariametropol",
    },
    {
      link:
        "https://web.archive.org/web/20191002211914/https://www.stw-ma.de/Essen+_+Trinken/Speisepl%C3%A4ne/Hochschule+Mannheim-p-3519.html",
      place: "hochschulemannheim",
    },
    {
      link:
        "https://web.archive.org/web/20191002212011/https://www.stw-ma.de/men%C3%BCplan_schlossmensa.html",
      place: "schlossmensa",
    },
  ];
  mensas.forEach(async (mensa) => {
    const page = await browser.newPage();
    await page.goto(mensa.link, {
      waitUntil: "networkidle0",
      timeout: 0,
    });
    await page.waitForSelector(".first");
    let bodyHtml = await page.evaluate(
      () => document.getElementById("mensa_plan").innerHTML
    );
    var handler = new htmlparser.DefaultHandler(function (error, dom) {});
    var parser = new htmlparser.Parser(handler);
    parser.parseComplete(bodyHtml);
    getTable(handler.dom, (table) => {
      parseTable(table, mensa.place, (parsed) => {
        parsed.forEach((food) => {
          insertOneInDB("food", food, () => {});
        });
      });
    });
  });
}

async function getPrice(page, _callback) {
  await page.evaluate(() => {
    let elements = document.getElementsByClassName("last");
    var prices = [];
    console.log(elements);
    for (let element of elements) {
      console.log(element.innerHTML);
    }
  });
}

function getTable(dom, _callback) {
  dom.forEach((e) => {
    if (e.name == "table" && e.attribs.class == "t1 persistent") {
      _callback(
        e.children[1].children
          .filter((obj) => {
            if (obj.name == "tr") {
              return true;
            } else {
              return false;
            }
          })
          .map((obj) => {
            return obj.children[3].children[3].children;
          })
          .map((obj) => {
            return obj
              .filter((filterO) => {
                if (filterO.name == "span") {
                  return true;
                } else {
                  return false;
                }
              })
              .map((mapO) => {
                return mapO.children.filter((filterOO) => {
                  if (filterOO.type == "text") {
                    return true;
                  } else {
                    return false;
                  }
                })[0].data;
              });
          })
      );
    }
  });
}

function parseTable(table, place, _callback) {
  var parsed = [];
  table.forEach((e, i) => {
    if (i < 3) {
      var type = "MAIN";
      var price = 3.2;
      var precision = 10; // 2 decimals
      var randomnum =
        Math.floor(
          Math.random() * (5 * precision - 1 * precision) + 1 * precision
        ) /
        (1 * precision);
      /*
    if (i == 3) {
      type = "GEMÜSETHEKE";
      price = 1;
    } else if (i == 4) {
      type = "PASTATHEKE";
      price = 1;
    } else if (i == 5) {
      type = "SALAT";
      price = 2;
    }
    */
      parsed.push({
        place: place,
        price: price,
        today: true,
        type: type,
        rating: randomnum,
        power: Math.floor(Math.random() * 100) + 1,
        details: e
          .join("")
          .replace(/&nbsp;/g, "")
          .replace(/mit/g, " mit ")
          .replace(/und/g, " und "),
      });
    }
  });
  _callback(parsed);
}

var sha512 = function (password) {
  var hash = crypto.createHash("sha512");
  hash.update(password);
  var value = hash.digest("hex");
  return value;
};

const checkToken = (req, res, next) => {
  const header = req.headers["authorization"];

  if (typeof header !== "undefined") {
    const bearer = header.split(" ");
    const token = bearer[1];

    req.token = token;
    next();
  } else {
    //If header is undefined return Forbidden (403)
    res.sendStatus(403);
  }
};

app.get("/getAllItems", (req, res) => {
  findInDB({ today: true, place: req.query.place }, "food", (result) => {
    res.json(result);
  });
});

app.post("/login", (req, res) => {
  findInDB({ email: req.body.email }, "user", (result) => {
    if (result.length != 0) {
      if (sha512(req.body.password) == result[0].password) {
        jwt.sign(
          { email: result[0].email },
          privateKey,
          { algorithm: "RS256" },
          function (err, token) {
            res.json({
              token: token,
              name: result[0].vorname + " " + result[0].nachname,
            });
          }
        );
      } else {
        res.status(403).send("Password falsch");
      }
    } else {
      res.status(403).send("Email falsch");
    }
  });
});

app.post("/register", (req, res) => {
  findInDB({ email: req.body.email }, "user", (result) => {
    if (result.length == 0) {
      var hashed = sha512(req.body.password);
      insertOneInDB(
        "user",
        {
          email: req.body.email,
          password: hashed,
          vorname: req.body.vorname,
          nachname: req.body.nachname,
        },
        () => {
          jwt.sign(
            { email: req.body.email },
            privateKey,
            { algorithm: "RS256" },
            function (err, token) {
              res.json({
                token: token,
              });
            }
          );
        }
      );
    } else {
      res.status(403).send("Email existiert bereits");
    }
  });
});

app.post("/pushRating", checkToken, (req, res) => {
  jwt.verify(req.token, publicKey, function (err, decoded) {
    if (err) {
      res.status(403).send("Kein Zugriff");
    } else {
      var values = JSON.parse(req.body.values);
      var finished = [];
      values.forEach((e) => {
        findInDB(ObjectId(e.id), "food", (result) => {
          if (e.type == "add") {
            var newRating =
              (result[0].rating * result[0].power + parseInt(e.rate)) /
              (result[0].power + 1);
            newRating = Math.round(newRating * 10) / 10;
            updateOneInDB(
              { _id: new ObjectId(e.id) },
              "food",
              {
                $set: {
                  rating: newRating,
                  power: result[0].power + 1,
                },
              },
              () => {
                finished.push("1");
                if (finished.length == values.length) {
                  res.send("ok");
                }
              }
            );
          } else if (e.type == "edit") {
            var newRating =
              (result[0].rating * result[0].power +
                (parseInt(e.rate) - parseInt(e.oldRate))) /
              result[0].power;
            newRating = Math.round(newRating * 10) / 10;
            updateOneInDB(
              { _id: new ObjectId(e.id) },
              "food",
              { $set: { rating: newRating } },
              () => {
                finished.push("1");
                if (finished.length == values.length) {
                  res.send("ok");
                }
              }
            );
          }
        });
      });
    }
  });
});
