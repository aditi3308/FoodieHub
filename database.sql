
CREATE DATABASE IF NOT EXISTS foodiehub;

USE foodiehub;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('customer', 'admin') DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Menu items table
CREATE TABLE IF NOT EXISTS menu_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image VARCHAR(500),
    category VARCHAR(100),
    available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status ENUM(
        'pending',
        'confirmed',
        'preparing',
        'out_for_delivery',
        'delivered',
        'cancelled'
    ) DEFAULT 'pending',
    delivery_address TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    menu_item_id INT NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

-- Sample food items
INSERT INTO menu_items (name, description, price, image, category)
VALUES
('Classic Burger', 'Delicious grilled burger', 149.00, '/images/classic-burger.jpg', 'Burgers'),
('Margherita Pizza', 'Classic cheese pizza', 249.00, '/images/margherita-pizza.jpg', 'Pizza'),
('Veg Biryani', 'Aromatic vegetable biryani', 179.00, '/images/veg-biryani.jpg', 'Rice'),
('French Fries', 'Crispy golden fries', 99.00, '/images/french-fries.jpg', 'Sides'),
('Chocolate Milkshake', 'Rich chocolate milkshake', 119.00, '/images/chocolate-milkshake.jpg', 'Drinks');

UPDATE menu_items
SET image = CASE name
    WHEN 'Classic Burger' THEN '/images/classic-burger.jpg'
    WHEN 'Margherita Pizza' THEN '/images/margherita-pizza.jpg'
    WHEN 'Veg Biryani' THEN '/images/veg-biryani.jpg'
    WHEN 'French Fries' THEN '/images/french-fries.jpg'
    WHEN 'Chocolate Milkshake' THEN '/images/chocolate-milkshake.jpg'
END
WHERE name IN (
    'Classic Burger',
    'Margherita Pizza',
    'Veg Biryani',
    'French Fries',
    'Chocolate Milkshake'
)
AND (image IS NULL OR image = '');
USE foodiehub;
SHOW TABLES;
SELECT * FROM menu_items;
USE foodiehub;

INSERT INTO users (name, email, password, role)
VALUES (
    'Admin',
    'admin@gmail.com',
    '$2b$12$QZP5jXD07pzcu8Sth/HDO.1XqrU4fonnTGdkLBRVQ2szYx3uE.u3S',
    'admin'
)
ON DUPLICATE KEY UPDATE
    name = 'Admin',
    password = '$2b$12$QZP5jXD07pzcu8Sth/HDO.1XqrU4fonnTGdkLBRVQ2szYx3uE.u3S',
    role = 'admin';

SELECT id, name, email, role
FROM users;
