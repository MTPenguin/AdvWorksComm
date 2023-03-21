SET NOEXEC off
go
USE AdvWorksComm
DECLARE @DatabaseInfo NVARCHAR(3750), @version NVARCHAR(20)
SET @version=N'1.0.20230320162844'
SELECT @DatabaseInfo =
  (
  SELECT 'AdvWorksComm' AS "Name", @version  AS "Version",
    'The AdvWorksComm.' AS "Description",
    GetDate() AS "Modified",
    SUser_Name() AS "by"
  FOR JSON PATH
  );

IF not EXISTS
  (SELECT name, value
FROM fn_listextendedproperty(
     N'Database_Info',default, default, default, default, default, default) )
    EXEC sys.sp_addextendedproperty @name=N'Database_Info', @value=@DatabaseInfo
ELSE
  EXEC sys.sp_Updateextendedproperty  @name=N'Database_Info', @value=@DatabaseInfo