Declare @version varchar(25);
SELECT @version= Coalesce(Json_Value(
 ( SELECT Convert(NVARCHAR(3760), value) 
   FROM sys.extended_properties AS EP
   WHERE major_id = 0 AND minor_id = 0 
    AND name = 'Database_Info'),'$[0].Version'),'that was not recorded');

PRINT @version
 