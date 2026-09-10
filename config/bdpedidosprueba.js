import mysql from "mysql2/promise";



const connection = mysql.createPool({
    namedPlaceholders:true,
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'base_pedidos'
})

console.log("Conexión a MySQL establecida.");


export default connection;
