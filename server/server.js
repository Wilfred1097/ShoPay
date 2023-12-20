import express, { response } from 'express';
import mysql from 'mysql';
import cors from 'cors'; 
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser';

const salt = 10;
dotenv.config();

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

const app = express();

app.use(cors({
  origin: "https://shopay-client.vercel.app",
  methods: ["POST", "GET", "PUT"],
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
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
app.post('/signup', async (req, res) => {
  const checkEmailQuery = "SELECT * FROM users WHERE email = ?";
  const checkUsernameQuery = "SELECT * FROM users WHERE username = ?";
  const insertUserQuery = "INSERT INTO users (`name`, `username`, `birthdate`, `address`, `role`, `email`, `password`, `profile_pic`) VALUES (?)";

  try {
      const connection = await pool.getConnection();

      try {
          const resultEmail = await connection.query(checkEmailQuery, [req.body.email]);

          if (resultEmail.length > 0) {
              return res.json({ Status: "Email already exists" });
          }

          const resultUsername = await connection.query(checkUsernameQuery, [req.body.username]);

          if (resultUsername.length > 0) {
              return res.json({ Status: "Username already exists" });
          }

          const hash = await bcrypt.hash(req.body.password.toString(), salt);
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

          const insertResult = await connection.query(insertUserQuery, [values]);

          return res.json({ Status: "Success" });
      } finally {
          connection.release();
      }
  } catch (error) {
      console.error("Error in signup route:", error);
      return res.status(500).json({ Error: "Internal Server Error" });
  }
});


//Login
app.post('/login', async (req, res) => {
  const sql = 'SELECT * FROM users WHERE email = ';

  try {
      const connection = await pool.getConnection();

      try {
          const [data] = await connection.query(sql + '?', [req.body.email]);

          if (data.length > 0) {
              const response = await bcrypt.compare(req.body.password.toString(), data[0].password);

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
          } else {
              return res.json({ Error: "No email existed" });
          }
      } finally {
          connection.release();
      }
  } catch (error) {
      console.error("Error in login route:", error);
      return res.status(500).json({ Error: "Internal Server Error" });
  }
});


//Profile and Purchase History
app.get('/profile', authenticateToken, async (req, res) => {
  const userId = req.userId;

  try {
    const connection = await pool.getConnection();
    try {
      const getUserQuery = 'SELECT * FROM users WHERE user_id = ?';
      const getPurchaseQuery = 'SELECT product_name, quantity, purchased_date FROM purchase WHERE user_id = ?';

      const [userRows] = await connection.query(getUserQuery, [userId]);
      const [purchaseRows] = await connection.query(getPurchaseQuery, [userId]);

      const user = userRows[0];
      const purchasedItems = purchaseRows.map((item) => ({
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
    } finally {
      connection.release(); // Release the connection back to the pool
    }
  } catch (error) {
    console.error('Error executing MySQL query:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
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
      const connection = await pool.getConnection();

      try {
          const resultProductName = await connection.query(checkProductNameQuery, [req.body.product_name]);

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

          const insertResult = await connection.query(insertProductQuery, [values]);

          return res.status(201).json({ Status: "Product added successfully" });
      } finally {
          connection.release();
      }

  } catch (error) {
      console.error('Error adding product:', error.message);
      res.status(500).json({ message: 'Internal server error' });
  }
});



//delete Record
app.delete('/delete/:itemType/:itemId', async (req, res) => {
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

  try {
      const connection = await pool.getConnection();

      try {
          const result = await connection.query(deleteQuery, [tableName, itemType === 'user' ? 'user_id' : 'product_id', itemId]);

          if (result.affectedRows === 0) {
              return res.status(404).json({ Error: 'Item not found' });
          }

          return res.json({ Status: 'Item deleted successfully' });
      } finally {
          connection.release();
      }
  } catch (err) {
      console.error('Error deleting item:', err);
      return res.status(500).json({ Error: 'Internal Server Error' });
  }
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
      const connection = await pool.getConnection();

      try {
          connection.query(updateQuery, values, (updateErr, updateResult) => {
              if (updateErr) {
                  console.error(`Error updating record in ${tableName} table:`, updateErr);
                  return res.status(500).json({ Error: "Internal Server Error" });
              }

              return res.status(200).json({ Status: `${tableName} record updated successfully` });
          });
      } finally {
          connection.release();
      }
  } catch (error) {
      console.error(`Error updating record in ${tableName} table:`, error.message);
      res.status(500).json({ message: 'Internal server error' });
  }
});


//fetch product details based on product ID
app.get('/product/:id', async (req, res) => {
  const productId = parseInt(req.params.id, 10);

  if (isNaN(productId)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
  }

  const getProductQuery = 'SELECT * FROM product WHERE product_id = ?';

  try {
      const connection = await pool.getConnection();

      try {
          connection.query(getProductQuery, [productId], (err, result) => {
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
      } finally {
          connection.release();
      }
  } catch (error) {
      console.error('Error fetching product details:', error.message);
      res.status(500).json({ message: 'Internal server error' });
  }
});


// Add to Cart
app.post('/add-to-cart', authenticateToken, async (req, res) => {
  const userId = req.userId;
  const productId = req.body.productId;

  const checkCartQuery = 'SELECT * FROM cart WHERE user_id = ? AND product_ids = ?';

  try {
      const connection = await pool.getConnection();

      try {
          connection.query(checkCartQuery, [userId, productId], async (checkErr, checkResult) => {
              if (checkErr) {
                  console.error('Error checking cart:', checkErr);
                  res.status(500).json({ error: 'Internal Server Error - Check Cart' });
                  return;
              }

              if (checkResult.length > 0) {
                  res.json({ status: 'Product already in the cart' });
                  return;
              }

              const checkProductQuantityQuery = 'SELECT * FROM product WHERE product_id = ? AND product_qty >= 1';

              try {
                  const quantityResult = await connection.query(checkProductQuantityQuery, [productId]);

                  if (quantityResult.length === 0) {
                      res.json({ status: 'Product quantity is not sufficient' });
                      return;
                  }

                  const addToCartQuery = 'INSERT INTO cart (user_id, product_ids, quantity) VALUES (?, ?, 1)';

                  try {
                      await connection.query(addToCartQuery, [userId, productId]);
                      res.json({ status: 'Product added to cart successfully' });
                  } catch (addErr) {
                      console.error('Error adding to cart:', addErr);
                      res.status(500).json({ error: 'Internal Server Error - Add to Cart' });
                  }
              } catch (quantityErr) {
                  console.error('Error checking product quantity:', quantityErr);
                  res.status(500).json({ error: 'Internal Server Error - Check Product Quantity' });
              }
          });
      } finally {
          connection.release();
      }
  } catch (error) {
      console.error('Error processing add-to-cart request:', error.message);
      res.status(500).json({ message: 'Internal server error' });
  }
});


// fetch cart products based on user ID
app.get('/cart', authenticateToken, async (req, res) => {
  const userId = req.userId;

  try {
      const connection = await pool.getConnection();

      try {
          const getCartProductsQuery = `
              SELECT * FROM CartProductView WHERE user_id = ?;
          `;

          const result = await connection.query(getCartProductsQuery, [userId]);

          const cartProducts = result[0].map((row) => ({
              cart_id: row.cart_id,
              product_id: row.product_id,
              product_name: row.product_name,
              product_description: row.product_description,
              product_price: row.product_price,
              quantity: row.quantity,
          }));

          res.json({ data: cartProducts });
      } finally {
          connection.release();
      }
  } catch (error) {
      console.error('Error fetching cart products:', error.message);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});


//Chekout
app.post('/checkout', authenticateToken, async (req, res) => {
  const { productName, cartId } = req.body;
  const userId = req.userId;

  try {
      const connection = await pool.getConnection();

      try {
          await connection.beginTransaction();

          // Insert into purchase
          await connection.query('INSERT INTO purchase (user_id, product_name, quantity) VALUES (?, ?, ?)', [userId, productName, 1]);

          // Update product quantity
          await connection.query('UPDATE product SET product_qty = product_qty - 1 WHERE product_name = ?', [productName]);

          // Delete from cart
          await connection.query('DELETE FROM cart WHERE cart_id = ?', [cartId]);

          await connection.commit();
          res.json({ success: true });
      } catch (error) {
          await connection.rollback();
          console.error('Error during checkout:', error);
          res.status(500).json({ error: 'Internal Server Error' });
      } finally {
          connection.release();
      }
  } catch (error) {
      console.error('Error processing checkout request:', error.message);
      res.status(500).json({ message: 'Internal server error' });
  }
});


const port = 3000;
app.listen(port, () => {
    console.log("Server is running on port", port);
})
