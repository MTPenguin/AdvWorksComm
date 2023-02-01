﻿SET NUMERIC_ROUNDABORT OFF
GO
SET ANSI_PADDING, ANSI_WARNINGS, CONCAT_NULL_YIELDS_NULL, ARITHABORT, QUOTED_IDENTIFIER, ANSI_NULLS ON
GO
PRINT N'Altering [SalesLT].[Customer]'
GO
ALTER TABLE [SalesLT].[Customer] DROP
COLUMN [New Dev2]
GO

﻿SET NUMERIC_ROUNDABORT OFF
GO
SET ANSI_PADDING, ANSI_WARNINGS, CONCAT_NULL_YIELDS_NULL, ARITHABORT, QUOTED_IDENTIFIER, ANSI_NULLS, NOCOUNT ON
GO
SET DATEFORMAT YMD
GO
SET XACT_ABORT ON
GO

PRINT(N'Update 3 rows in [SalesLT].[Customer]')
UPDATE [SalesLT].[Customer] SET [Suffix]=N'Wed' WHERE [CustomerID] = 1
UPDATE [SalesLT].[Customer] SET [Suffix]=N'And Data' WHERE [CustomerID] = 2
UPDATE [SalesLT].[Customer] SET [Suffix]=N'Dude' WHERE [CustomerID] = 3

