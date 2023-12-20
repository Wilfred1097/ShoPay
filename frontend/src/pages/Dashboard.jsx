import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Navbar, Nav, Card, Button, Container, Row, Col } from 'react-bootstrap';
import CustomNavbar from './NavigationBar';

function Dashboard() {
  const navigate = useNavigate();
  const [productData, setProductData] = useState([]);

  useEffect(() => {
    fetch('https://shopay-api.vercel.app/product')
      .then((response) => response.json())
      .then((responseData) => {
        setProductData(responseData);
      })
      .catch((error) => {
        console.error('Error fetching data:', error);
      });
  }, []);

  return (
    <>
    <div>
      <CustomNavbar />
    </div>
    
      <Container fluid className="mt-5 pt-5">
      <Row xs={2} md={3} lg={4} xl={5} xxl={6} className="g-4">
          {productData.map((product, index) => (
            <Col key={index}>
              <Card style={{ width: '14rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Card.Img
                  variant="top"
                  src={product.product_photo}
                  style={{ height: '50%', objectFit: 'cover' }}/>
                <Card.Body className="d-flex flex-column">
                  <Card.Title>{product.product_name}</Card.Title>
                  <Card.Text>{product.product_description}</Card.Text>
                  <div className="mt-auto d-sm-inline-block">
                    <Card.Text>Available Quantity: {product.product_qty}</Card.Text>
                    <Button variant="success">View Details</Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      </Container>
    </>
  )
}

export default Dashboard
