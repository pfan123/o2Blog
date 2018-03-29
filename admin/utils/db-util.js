const allConfig = require("../sysConfig")
const config = allConfig.database
const mysql = require("mysql")

const pool = mysql.createPool({
  host     :  config.HOST,
  user     : config.USERNAME,
  password : config.PASSWORD,
  database : config.DATABASE
})

/**
 * 定义错误信息格式， -1 操作失败
 * @param {*} err 
 */
let errMes = err => {
  return {
    code: -1,
    err
  }
}


let query = function( sql, values ) {
  return new Promise(( resolve, reject ) => {
    pool.getConnection(function(err, connection) {
      if (err) {
        resolve( errMes(err) )
      } else {
        connection.query(sql, values, ( err, rows) => {

          if ( err ) {
            reject( errMes(err) )
          } else {
            resolve( rows )
          }
          connection.release()
        })
      }
    })
  })

}

let createTable = function( sql ) {
  return query( sql, [] )
}


let findDataById = function( table,  id ) {
  let  _sql =  "SELECT * FROM ?? WHERE id = ? "
  return query( _sql, [ table, id ] )
}

let findDataByCategroy = function( table,  categroy ) {
  let  _sql =  "SELECT * FROM ?? WHERE categroy = ? "
  return query( _sql, [ table, categroy ] )
}

let findDataByPage = function( table, keys, start, end ) {
  let  _sql =  "SELECT ?? FROM ??  LIMIT ? , ?"
  return query( _sql, [keys,  table,  start, end ] )
}


let insertData = function( table, values ) {
  let _sql = "INSERT INTO ?? SET ?"
  return query( _sql, [ table, values ] )
}


let updateData = function( table, values, id ) {
  let _sql = "UPDATE ?? SET ? WHERE id = ?"
  return query( _sql, [ table, values, id ] )
}


let deleteDataById = function( table, id ) {
  let _sql = "DELETE FROM ?? WHERE id = ?"
  return query( _sql, [ table, id ] )
}


let select = function( table, keys ) {
  let  _sql =  "SELECT ?? FROM ?? "
  return query( _sql, [ keys, table ] )
}

let count = function( table ) {
  let  _sql =  "SELECT COUNT(*) AS total_count FROM ?? "
  return query( _sql, [ table ] )
}

module.exports = {
  query,
  createTable,
  findDataById,
  findDataByCategroy,
  findDataByPage,
  deleteDataById,
  insertData,
  updateData,
  select,
  count
}
