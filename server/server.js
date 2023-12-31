import express, { response } from 'express';
import mysql from 'mysql';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser';

const salt = 10;
dotenv.config();

const app = express();
const cors = require('cors');
app.use(cors({
  origin: "*",
  methods: ["POST", "GET", "PUT"],
  credentials: true
}));

app.options('*', cors());

app.use(express.json());
app.use(cookieParser());

const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized", message: "Authentication token is missing." });
  }

  jwt.verify(token, process.env.USER_TOKEN, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: "Unauthorized", message: "Authentication token has expired." });
      } else {
        return res.status(403).json({ error: "Forbidden", message: "Invalid authentication token." });
      }
    }

    req.userId = user.userId;
    next();
  });
};

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT,
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database', err);
        process.exit(1); // Terminate the application
    } else {
        console.log('Connected to the database');
    }
});


// Registration
app.post('/signup', (req, res) => {
    const checkEmailQuery = "SELECT * FROM users WHERE email = ?";
    const checkUsernameQuery = "SELECT * FROM users WHERE username = ?";
    const insertUserQuery = "INSERT INTO users (`name`, `username`, `birthdate`, `address`, `role`, `email`, `password`, `profile_pic`) VALUES (?)";

    db.query(checkEmailQuery, [req.body.email], (errEmail, resultEmail) => {
        if (errEmail) {
            console.error("Error checking email:", errEmail);
            return res.status(500).json({ Error: "Internal Server Error" });
        }

        if (resultEmail.length > 0) {
            return res.json({ Status: "Email already exists" });
        }

        db.query(checkUsernameQuery, [req.body.username], (errUsername, resultUsername) => {
            if (errUsername) {
                console.error("Error checking username:", errUsername);
                return res.status(500).json({ Error: "Internal Server Error" });
            }

            if (resultUsername.length > 0) {
                return res.json({ Status: "Username already exists" });
            }

            bcrypt.hash(req.body.password.toString(), salt).then((hash) => {
                const values = [
                    req.body.name,
                    req.body.username,
                    req.body.birthdate,
                    req.body.address,
                    req.body.role,
                    req.body.email,
                    hash,
                    req.body.profile_pic
                ];

                db.query(insertUserQuery, [values], (insertErr, insertResult) => {
                    if (insertErr) {
                        console.error("Error inserting user:", insertErr);
                        return res.status(500).json({ Error: "Internal Server Error" });
                    }

                    return res.json({ Status: "Success" });
                });
            }).catch((hashErr) => {
              console.error("Error hashing password:", hashErr);
              return res.status(500).json({ Error: "Internal Server Error" });
            });
        });
    });
});

//Login
app.post('/login', (req, res) => {
  const sql = 'SELECT * FROM users WHERE email = ?';
  db.query(sql, [req.body.email], (err, data) => {
      if (err) return res.json({ Error: "Login error in server" });

      if (data.length > 0) {
        bcrypt.compare(req.body.password.toString(), data[0].password)
          .then((response) => {
              if (compareErr) return res.json({ Error: "Password compare error" });

              if (response) {
                  const name = data[0].name;
                  const userId = data[0].user_id; 
                  const userRole = data[0].role;

                  let secretKey;
                  if (userRole === 'admin') {
                    if (!process.env.ADMIN_TOKEN) {
                        return res.json({ Error: "Admin token not configured" });
                    }
                    secretKey = process.env.ADMIN_TOKEN || 'defaultAdminToken';
                  } else if (userRole === 'user') {
                      if (!process.env.USER_TOKEN) {
                          return res.json({ Error: "User token not configured" });
                      }
                      secretKey = process.env.USER_TOKEN || 'defaultUserToken';
                  } else {
                      return res.json({ Error: "Invalid user role" });
                  }
                  
                  const token = jwt.sign({ userId, name }, secretKey, { expiresIn: '1d' });
                  res.cookie('token', token);

                  return res.json({ Status: "Success", Role: userRole, UserId: userId });
              } else {
                  return res.json({ Error: "Password not matched" });
              }
          }).catch((compareErr) => {
            console.error("Password compare error:", compareErr);
            return res.status(500).json({ Error: "Internal Server Error" });
          });
      } else {
          return res.json({ Error: "No email existed" });
      }
  });
});

//Profile and Purchase History
app.get('/profile', authenticateToken, (req, res) => {
  const userId = req.userId;

  const getUserQuery = 'SELECT * FROM users WHERE user_id = ?';
  const getPurchaseQuery = 'SELECT product_name, quantity, purchased_date FROM purchase WHERE user_id = ?';

  db.query(getUserQuery, [userId], (userErr, userResult) => {
    if (userErr) {
      console.error('Error executing MySQL query for user information:', userErr);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    const user = userResult[0];

    db.query(getPurchaseQuery, [userId], (purchaseErr, purchaseResult) => {
      if (purchaseErr) {
        console.error('Error executing MySQL query for purchased items:', purchaseErr);
        res.status(500).json({ error: 'Internal Server Error' });
        return;
      }

      const purchasedItems = purchaseResult.map((item) => ({
        product_name: item.product_name,
        quantity: item.quantity,
        purchased_date: item.purchased_date,
      }));

      res.json({
        userId: user.user_id,
        name: user.name,
        username: user.username,
        address: user.address,
        email: user.email,
        profile_pic: user.profile_pic,
        purchasedItems: purchasedItems,
      });
    });
  });
});

//Logout
app.post('/logout', (req, res) => {
    res.cookie('token', '', { expires: new Date(0) });
    return res.json({ Status: 'Success' });
});

//get all user
app.get('/data', (req, res) => {
    const query = 'SELECT * FROM users'; 
  
    db.query(query, (err, result) => {
      if (err) {
        console.error('Error executing MySQL query:', err);
        res.status(500).json({ error: 'Internal Server Error' });
        return;
      }
  
      res.json(result);
    });
  });

//get Product
app.get('/product', (req, res) => {
const query = 'SELECT * FROM product';

db.query(query, (err, result) => {
    if (err) {
    console.error('Error executing MySQL query:', err);
    res.status(500).json({ error: 'Internal Server Error' });
    return;
    }

    res.json(result);
    });
});

//add Product
app.post('/add_product', async (req, res) => {
    const checkProductNameQuery = "SELECT * FROM product WHERE product_name = ?";
    const insertProductQuery = "INSERT INTO product (`product_name`, `product_description`, `product_photo`, `product_price`, `product_qty`) VALUES (?)";

    try {
        const resultProductName = await db.query(checkProductNameQuery, [req.body.product_name]);

        if (resultProductName.length > 0) {
            return res.json({ Status: "Product name already exists" });
        }

        const values = [
            req.body.product_name,
            req.body.product_description,
            req.body.product_photo,
            req.body.product_price,
            req.body.product_qty,
        ];

        const insertResult = await db.query(insertProductQuery, [values]);

        return res.status(201).json({ Status: "Product added successfully" });

    } catch (error) {
        console.error('Error adding product:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
});

//delete Record
app.delete('/delete/:itemType/:itemId', (req, res) => {
  const { itemType, itemId } = req.params;

  if (isNaN(itemId)) {
    return res.status(400).json({ Error: 'Invalid item ID' });
  }

  let tableName;

  if (itemType === 'user') {
    tableName = 'users';
  } else if (itemType === 'product') {
    tableName = 'product';
  } else {
    return res.status(400).json({ Error: 'Invalid item type' });
  }

  const deleteQuery = `DELETE FROM ?? WHERE ?? = ?`;

  db.query(deleteQuery, [tableName, itemType === 'user' ? 'user_id' : 'product_id', itemId], (err, result) => {
    if (err) {
      console.error('Error deleting item:', err);
      return res.status(500).json({ Error: 'Internal Server Error' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ Error: 'Item not found' });
    }

    return res.json({ Status: 'Item deleted successfully' });
  });
});

//Updating record
app.put('/update/:tableName/:id', async (req, res) => {
  const tableName = req.params.tableName;
  const id = req.params.id;
  let updateQuery, values;

  if (tableName === 'product') {
    updateQuery = "UPDATE product SET product_name=?, product_description=?, product_price=?, product_qty=? WHERE product_id=?";
    values = [req.body.product_name, req.body.product_description, req.body.product_price, req.body.product_qty, id];
  } else if (tableName === 'users') {
    updateQuery = "UPDATE users SET name=?, username=?, birthdate=?, address=?, role=?, email=?, profile_pic=? WHERE user_id=?";
    values = [req.body.name, req.body.username, req.body.birthdate, req.body.address, req.body.role, req.body.email, req.body.profile_pic, id];
  } else {
    return res.status(400).json({ Error: "Invalid table name" });
  }

  try {
    db.query(updateQuery, values, (updateErr, updateResult) => {
      if (updateErr) {
        console.error(`Error updating record in ${tableName} table:`, updateErr);
        return res.status(500).json({ Error: "Internal Server Error" });
      }

      return res.status(200).json({ Status: `${tableName} record updated successfully` });
    });
  } catch (error) {
    console.error(`Error updating record in ${tableName} table:`, error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

//fetch product details based on product ID
app.get('/product/:id', (req, res) => {
  const productId = parseInt(req.params.id, 10);

  if (isNaN(productId)) {
    res.status(400).json({ error: 'Invalid product ID' });
    return;
  }

  const getProductQuery = 'SELECT * FROM product WHERE product_id = ?';

  db.query(getProductQuery, [productId], (err, result) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    if (result.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const product = result[0];

    res.json({
      product_id: product.product_id,
      product_name: product.product_name,
      product_description: product.product_description,
      product_photo: product.product_photo,
      product_price: product.product_price,
      product_qty: product.product_qty,
    });
  });
});

// Add to Cart
app.post('/add-to-cart', authenticateToken, (req, res) => {
  const userId = req.userId;
  const productId = req.body.productId;

  const checkCartQuery = 'SELECT * FROM cart WHERE user_id = ? AND product_ids = ?';
  db.query(checkCartQuery, [userId, productId], (checkErr, checkResult) => {
    if (checkErr) {
      console.error('Error checking cart:', checkErr);
      return res.status(500).json({ error: 'Internal Server Error - Check Cart' });
    }

    if (checkResult.length > 0) {
      return res.json({ status: 'Product already in the cart' });
    }

    const checkProductQuantityQuery = 'SELECT * FROM product WHERE product_id = ? AND product_qty >= 1';
    db.query(checkProductQuantityQuery, [productId], (quantityErr, quantityResult) => {
      if (quantityErr) {
        console.error('Error checking product quantity:', quantityErr);
        return res.status(500).json({ error: 'Internal Server Error - Check Product Quantity' });
      }

      if (quantityResult.length === 0) {
        return res.json({ status: 'Product quantity is not sufficient' });
      }

      const addToCartQuery = 'INSERT INTO cart (user_id, product_ids, quantity) VALUES (?, ?, 1)';
      db.query(addToCartQuery, [userId, productId], (addErr, addResult) => {
        if (addErr) {
          console.error('Error adding to cart:', addErr);
          return res.status(500).json({ error: 'Internal Server Error - Add to Cart' });
        }

        return res.json({ status: 'Product added to cart successfully' });
      });
    });
  });
});

// fetch cart products based on user ID
app.get('/cart', authenticateToken, (req, res) => {
  const userId = req.userId;

  const getCartProductsQuery = `
    SELECT * FROM CartProductView WHERE user_id = ?;
  `;

  db.query(getCartProductsQuery, [userId], (err, result) => {
    if (err) {
      console.error('Error executing MySQL query:', err);
      return res.status(500).json({
        error: 'Internal Server Error',
        details: 'An error occurred while fetching cart products.',
      });
    }

    const cartProducts = result.map((row) => ({
      cart_id: row.cart_id,
      product_id: row.product_id,
      product_name: row.product_name,
      product_description: row.product_description,
      product_price: row.product_price,
      quantity: row.quantity,
    }));

    res.json({ data: cartProducts });
  });
});

//Chekout
app.post('/checkout', authenticateToken, async (req, res) => {
  const { productName, cartId } = req.body;
  const userId = req.userId;

  try {
    await db.query('INSERT INTO purchase (user_id, product_name, quantity) VALUES (?, ?, ?)', [userId, productName, 1]);

    await db.query('UPDATE product SET product_qty = product_qty - 1 WHERE product_name = ?', [productName]);

    await db.query('DELETE FROM cart WHERE cart_id = ?', [cartId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error during checkout:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const port = 3000;
app.listen(port, () => {
    console.log("Server is running on port", port);
})
