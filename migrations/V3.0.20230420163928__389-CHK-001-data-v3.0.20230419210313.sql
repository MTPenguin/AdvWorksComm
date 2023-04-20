  Declare @version varchar(25);
  SELECT @version= Coalesce(Json_Value(
    (SELECT Convert(NVARCHAR(3760), value) 
    FROM sys.extended_properties AS EP
    WHERE major_id = 0 AND minor_id = 0 
      AND name = 'Database_Info'), '$[0].Version'), 'that was not recorded');
  -- PARSENAME USED TO ONLY COMPARE MAJOR AND MINOR
  IF PARSENAME(@version, 3) + PARSENAME(@version, 2)  <> PARSENAME('3.0.20230419210313', 3) + PARSENAME('3.0.20230419210313', 2)
  BEGIN
  RAISERROR ('The Target was at version %s, not the correct version (3.0.20230419210313)',16,1,@version)
  SET NOEXEC ON;
  END
--flybot created V3.0.20230420163928__389-CHK-001-data-v3.0.20230419210313
-- DEBUG ---
PRINT(N'Update 6 rows in [SalesLT].[Customer]')
      UPDATE [SalesLT].[Customer] SET [Suffix]='042016' WHERE [CustomerID] = 1
      UPDATE [SalesLT].[Customer] SET [Suffix]='042016' WHERE [CustomerID] = 2
      UPDATE [SalesLT].[Customer] SET [Suffix]='042016' WHERE [CustomerID] = 3
      UPDATE [SalesLT].[Customer] SET [Suffix]='042016' WHERE [CustomerID] = 4
      UPDATE [SalesLT].[Customer] SET [Suffix]='042016' WHERE [CustomerID] = 5
      UPDATE [SalesLT].[Customer] SET [Suffix]='042016' WHERE [CustomerID] = 6
    -- DEBUG ---



  PRINT N'Creating extended properties'
  SET NOEXEC off
  go
  USE AdvWorksComm
  DECLARE @DatabaseInfo NVARCHAR(3750), @version NVARCHAR(20)
  SET @version=N'3.0.20230420163928'
  PRINT N'New version === ' + @version
  SELECT @DatabaseInfo =
    (
    SELECT 'AdvWorksComm' AS "Name", @version  AS "Version",
    'The AdvWorksComm.' AS "Description",
      GetDate() AS "Modified",
  SUser_Name() AS "by"
    FOR JSON PATH
    );
  
  IF not EXISTS
    (SELECT name, value  FROM fn_listextendedproperty(
      N'Database_Info',default, default, default, default, default, default) )
      EXEC sys.sp_addextendedproperty @name=N'Database_Info', @value=@DatabaseInfo
  ELSE
    EXEC sys.sp_Updateextendedproperty  @name=N'Database_Info', @value=@DatabaseInfo
