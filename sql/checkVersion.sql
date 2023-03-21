Declare @version varchar(25);

SELECT @version= Coalesce(Json_Value(

    (SELECT Convert(NVARCHAR(3760), value) 

    FROM sys.extended_properties AS EP

    WHERE major_id = 0 AND minor_id = 0 

      AND name = 'Database_Info'), '$[0].Version'), 'that was not recorded');

IF @version <> '1.0.0'

  BEGIN

  RAISERROR ('The Target was at version %s, not the correct version (\)',16,1,@version)

  SET NOEXEC ON;

END